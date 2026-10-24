// Import and export of `.kuttab` course packs.
import { extractMarkdown, type KnowledgeBase } from "@kuttab/kb";
import { planFromObjectives, type Plan } from "./plan.ts";
import { Pack, type Lesson, type PackInput } from "./schema.ts";

export const PACK_EXT = ".kuttab";

export class PackError extends Error {}

/** Parses and validates pack JSON, with readable errors. */
export function parsePack(text: string): Pack {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ""));
  } catch (e) {
    throw new PackError(`Not a valid .kuttab file (JSON error: ${(e as Error).message})`);
  }
  const r = Pack.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new PackError(`Not a valid .kuttab file: ${first.join("; ")}`);
  }
  const pack = r.data;
  const ids = new Set(pack.objectives.map((o) => o.id));
  for (const l of pack.lessons) if (!ids.has(l.objectiveId)) throw new PackError(`Lesson "${l.title}" points to unknown objective "${l.objectiveId}"`);
  planFromObjectives(pack.id, pack.title, pack.objectives); // throws on cycles / unknown prereqs
  return pack;
}

export function planFromPack(pack: Pack): Plan {
  return { ...planFromObjectives(pack.id, pack.title, pack.objectives, pack.id), lang: pack.lang, description: pack.description };
}

/** Indexes the pack's reference text so grounded answers can cite it. */
export async function indexPack(kb: KnowledgeBase, pack: Pack, addedAt = new Date().toISOString()): Promise<void> {
  for (const s of pack.sources) {
    await kb.add({ id: `pack:${pack.id}:${s.id}`, title: s.title, kind: "pack", origin: pack.id, addedAt }, extractMarkdown(s.markdown));
  }
}

/** Exports a plan and its cached lessons as a pack anyone can import. */
export function exportPack(plan: Plan, lessons: Lesson[], meta: { description: string; lang: PackInput["lang"]; author?: string; license?: string; sources?: PackInput["sources"] }): string {
  const pack: PackInput = {
    format: "kuttab",
    version: 1,
    id: (plan.packId ?? plan.id).toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+/, "") || "my-course",
    title: plan.title,
    description: meta.description,
    lang: meta.lang,
    author: meta.author,
    license: meta.license,
    objectives: plan.items.map(({ id, title, summary, prereqs, lab }) => ({ id, title, summary, prereqs, lab })),
    lessons: lessons.map(({ generatedBy: _g, ...l }) => l),
    sources: meta.sources ?? [],
  };
  return JSON.stringify(Pack.parse(pack), null, 2);
}
