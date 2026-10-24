// Track builder: research a topic once, keep what was found as a resource pack,
// and teach every later lesson from that pack without searching again.
// Web search and page fetching are adapters supplied by the app (T-23); the
// engine only decides when to use them and what to keep.
import { z } from "zod";
import { KnowledgeBase, type Embed, type Hit, type Section, type Source } from "@kuttab/kb";
import { generatePlan } from "./teach.ts";
import { languageRule, structured, type Ctx } from "./llm.ts";
import { planFromObjectives, type Plan } from "./plan.ts";
import { hash } from "./store.ts";
import type { LearnerProfile, Objective } from "./schema.ts";

/** Where a track's material comes from, chosen when the track is created. */
export type SourceMix = "none" | "mine" | "mine-then-web";
/** What to keep from web pages: full copies in the learner's library, or excerpts plus links. */
export type KeepWeb = "pages" | "notes";

export interface WebResult {
  title: string;
  url: string;
  snippet?: string;
}
export interface WebAdapter {
  search(query: string, n: number): Promise<WebResult[]>;
  fetch(url: string): Promise<{ title: string; sections: Section[] }>;
}

export interface Excerpt {
  sourceId: string;
  title: string;
  text: string;
  locator?: string;
  /** Set for web material, so a notes-only pack still links to the page. */
  url?: string;
}

export interface ResourcePack {
  planId: string;
  builtAt: string;
  mix: SourceMix;
  keep: KeepWeb;
  /** Web queries already run, so a rebuild or a mid-track search does not repeat them. */
  queries: string[];
  /** The mix asked for the web but no web search was set up. */
  webSkipped?: boolean;
  /** Excerpts per objective id. Lessons read these instead of searching. */
  objectives: Record<string, Excerpt[]>;
}

/** Fewer of the learner's own hits than this, and the web is searched (when the mix allows). */
export const THIN_HITS = 3;
export const MAX_PAGES = 6;
const PER_OBJECTIVE = 4;

export interface BuildTrackInput {
  topic: string;
  profile: LearnerProfile;
  mix: SourceMix;
  keep?: KeepWeb;
  /** The learner's library. Pages kept as "pages" are added to it; the caller saves it. */
  kb: KnowledgeBase;
  embed?: Embed;
  web?: WebAdapter;
  makeId?: (title: string) => string;
  onStep?: (step: "searching" | "researching" | "planning" | "packing") => void;
}

export interface BuiltTrack {
  plan: Plan;
  pack: ResourcePack;
  /** Web pages added to the learner's library (keep = "pages"). */
  added: Source[];
  /** True when the mix asked for the web but no web adapter was available. */
  webSkipped: boolean;
}

const QueriesOut = z.object({ queries: z.array(z.string()).min(1).max(4) });

/** Builds a plan and its resource pack. The only step that may touch the network. */
export async function buildTrack(ctx: Ctx, input: BuildTrackInput): Promise<BuiltTrack> {
  const { topic, profile, mix, kb, embed, web } = input;
  const keep = input.keep ?? "notes";
  input.onStep?.("searching");
  const own = mix === "none" || !kb.size ? [] : await kb.search(topic, 8, embed);

  const pages = new KnowledgeBase();
  const queries: string[] = [];
  const wantWeb = mix === "mine-then-web" && (own.length < THIN_HITS || kb.coverage(topic, own) < 0.5);
  if (wantWeb && web) {
    input.onStep?.("researching");
    const q = await structured(
      ctx,
      "teacher",
      "research queries",
      QueriesOut,
      `You plan web research for a course. ${languageRule(profile.lang)} Queries may be in English when that finds better sources.`,
      `Write 2 to 4 short web search queries that together cover the topic "${topic}" for this learner (level: ${profile.level}, goal: ${profile.goal || "not given"}). Prefer queries that find explanations and tutorials, not news.`,
    );
    queries.push(...q.queries.map((s) => s.trim()).filter(Boolean));
    await research(web, queries, pages, embed, MAX_PAGES);
  }

  input.onStep?.("planning");
  const webHits = pages.size ? await pages.search(topic, 8, embed) : [];
  const out = await generatePlan(ctx, profile, topic.trim(), [...own, ...webHits].slice(0, 10));
  const title = out.title || topic.trim();
  const id = input.makeId?.(title) ?? `track-${hash(title + Date.now())}`;
  const plan: Plan = { ...planFromObjectives(id, title, out.objectives), lang: profile.lang, description: topic.trim() };

  input.onStep?.("packing");
  const webSkipped = wantWeb && !web;
  const pack: ResourcePack = { planId: id, builtAt: new Date().toISOString(), mix, keep, queries, objectives: {}, ...(webSkipped && { webSkipped }) };
  if (mix !== "none") {
    for (const o of plan.items) {
      const q = objectiveQuery(o);
      const mine = kb.size ? await kb.search(q, PER_OBJECTIVE, embed) : [];
      const found = pages.size ? await pages.search(q, PER_OBJECTIVE, embed) : [];
      pack.objectives[o.id] = merge([], [...mine, ...found].sort((a, b) => b.score - a.score).map(excerpt)).slice(0, PER_OBJECTIVE);
    }
  }

  const added = keep === "pages" ? await keepPages(pages, kb, embed) : [];
  return { plan, pack, added, webSkipped };
}

export interface SearchMoreInput {
  pack: ResourcePack;
  objective: Objective;
  query: string;
  web?: WebAdapter;
  kb: KnowledgeBase;
  embed?: Embed;
  pages?: number;
}

/**
 * A mid-track "search the web" request. Always honoured, whatever the track's
 * source mix; the new excerpts join the objective's part of the pack.
 */
export async function searchMore(input: SearchMoreInput): Promise<{ pack: ResourcePack; found: Excerpt[]; added: Source[] }> {
  const { pack, objective, query, web, kb, embed } = input;
  if (!web) throw new Error("Web search is not set up. Add a search provider in Settings.");
  const q = query.trim() || objectiveQuery(objective);
  const pages = new KnowledgeBase();
  await research(web, [q], pages, embed, input.pages ?? 3);
  const found = pages.size ? (await pages.search(`${q} ${objectiveQuery(objective)}`, PER_OBJECTIVE, embed)).map(excerpt) : [];
  const prev = pack.objectives[objective.id] ?? [];
  const next: ResourcePack = {
    ...pack,
    queries: pack.queries.includes(q) ? pack.queries : [...pack.queries, q],
    objectives: { ...pack.objectives, [objective.id]: merge(prev, found) },
  };
  const added = pack.keep === "pages" ? await keepPages(pages, kb, embed) : [];
  return { pack: next, found: found.filter((f) => !prev.some((p) => same(p, f))), added };
}

/** The pack's excerpts for one objective, shaped as search hits so lessons can cite them. */
export function packHits(pack: ResourcePack | undefined, objectiveId: string): Hit[] {
  return (pack?.objectives[objectiveId] ?? []).map((e, i) => ({
    chunk: { id: `${e.sourceId}#p${i}`, sourceId: e.sourceId, text: e.text, locator: e.locator },
    source: { id: e.sourceId, title: e.title, kind: e.url ? "url" : "text", origin: e.url, addedAt: pack!.builtAt },
    score: 1 / (1 + i),
  }));
}

export function objectiveQuery(o: Pick<Objective, "title" | "summary">): string {
  return `${o.title} ${o.summary}`;
}

async function research(web: WebAdapter, queries: string[], into: KnowledgeBase, embed: Embed | undefined, max: number): Promise<void> {
  const seen = new Set<string>();
  const results: WebResult[] = [];
  for (const q of queries) {
    for (const r of await web.search(q, 5)) {
      const url = r.url.split("#")[0]!;
      if (seen.has(url)) continue;
      seen.add(url);
      results.push({ ...r, url });
    }
  }
  for (const r of results.slice(0, max)) {
    try {
      const page = await web.fetch(r.url);
      if (!page.sections.length) continue;
      const source: Source = { id: `web-${hash(r.url)}`, title: page.title || r.title, kind: "url", origin: r.url, addedAt: new Date().toISOString() };
      await into.add(source, page.sections, embed);
    } catch {
      // One unreachable page should not fail the build.
    }
  }
}

async function keepPages(pages: KnowledgeBase, kb: KnowledgeBase, embed?: Embed): Promise<Source[]> {
  const snap = pages.snapshot();
  const added: Source[] = [];
  for (const s of snap.sources) {
    const sections = snap.chunks.filter((c) => c.sourceId === s.id).map((c) => ({ text: c.text, locator: c.locator }));
    await kb.add(s, sections, embed);
    added.push(s);
  }
  return added;
}

function excerpt(h: Hit): Excerpt {
  return { sourceId: h.source.id, title: h.source.title, text: h.chunk.text, locator: h.chunk.locator, url: h.source.kind === "url" ? h.source.origin : undefined };
}

const same = (a: Excerpt, b: Excerpt) => a.sourceId === b.sourceId && a.text === b.text;
function merge(a: Excerpt[], b: Excerpt[]): Excerpt[] {
  const out = [...a];
  for (const e of b) if (!out.some((x) => same(x, e))) out.push(e);
  return out;
}
