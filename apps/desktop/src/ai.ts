// Builds engine contexts from the learner's model settings. Keys come from the
// secret store at call time and are never kept in app state, logged or exported.
import { embedMany, generateText } from "ai";
import { TEACHER_TOOLS, addFacts, objectiveQuery, packHits, type Ctx, type Objective, type TeacherTool, type ToolHost } from "@kuttab/engine";
import type { Embed, Hit } from "@kuttab/kb";
import { createEmbedder, createModel, estimateCost, listModels, providerInfo, supportsTools, type FetchFn } from "@kuttab/llm-gateway";
import { webLlmFetch } from "./platform/webllm.ts";
import { addUsage, modelKey, services, useStore, type ModelChoice } from "./state.ts";

export const keyId = (provider: string) => `key:${provider}`;

export class NoModelError extends Error {
  constructor() {
    super("no-model");
  }
}

function fetchFor(provider: string): FetchFn {
  const { platform } = services();
  return provider === "webllm" ? webLlmFetch(platform.fetch) : platform.fetch;
}

function baseURLFor(c: ModelChoice): string | undefined {
  return c.baseURL || useStore.getState().settings.baseURLs[c.provider] || undefined;
}

async function creds(provider: string) {
  if (!providerInfo(provider).needsKey && provider !== "custom") return {};
  return { apiKey: await services().platform.secrets.get(keyId(provider)) };
}

async function model(c: ModelChoice) {
  return createModel({ provider: c.provider, model: c.model, baseURL: baseURLFor(c) }, await creds(c.provider), fetchFor(c.provider));
}

export function hasTeacher(): boolean {
  return !!useStore.getState().settings.teacher?.model;
}

/** Engine context for the current settings. Throws NoModelError when no teacher is set. */
export async function makeCtx(signal?: AbortSignal): Promise<Ctx> {
  const { teacher, grader, prices } = useStore.getState().settings;
  if (!teacher?.model) throw new NoModelError();
  const g = grader?.model ? grader : undefined;
  return {
    teacher: await model(teacher),
    grader: g ? await model(g) : undefined,
    signal,
    onUsage(u) {
      const who = u.role === "grader" && g ? g : teacher;
      addUsage(u.inputTokens ?? 0, u.outputTokens ?? 0, estimateCost(who.provider, who.model, u, prices));
    },
  };
}

/** The teacher tools to offer: none for models without tool calls, minus what the learner switched off. */
export function tutorTools(): TeacherTool[] {
  const { teacher, toolsOff } = useStore.getState().settings;
  if (!teacher?.model || !supportsTools(teacher.provider, teacher.model)) return [];
  return TEACHER_TOOLS.filter((t) => !toolsOff.includes(t.name));
}

/** What data tools may touch: the learner's documents and the profile notes. */
export function toolHost(): ToolHost {
  const { kb } = services();
  return {
    searchSources: kb.size
      ? async (q) => (await kb.search(q, 4, await kbEmbed())).map((h) => ({ title: h.chunk.locator ? `${h.source.title} (${h.chunk.locator})` : h.source.title, text: h.chunk.text }))
      : undefined,
    rememberFact: async (fact) => {
      const { course } = services();
      await course.saveMemory(addFacts(await course.memory(), [{ text: fact, from: "chat" }]));
    },
  };
}

export function teacherName(): string | undefined {
  const t = useStore.getState().settings.teacher;
  return t ? modelKey(t) : undefined;
}

/** Embedding function for the knowledge base, or undefined when none is set. */
export async function embedFn(): Promise<Embed | undefined> {
  const { embedder, prices } = useStore.getState().settings;
  if (!embedder?.model) return undefined;
  const m = createEmbedder({ provider: embedder.provider, model: embedder.model, baseURL: baseURLFor(embedder) }, await creds(embedder.provider), fetchFor(embedder.provider));
  return async (texts) => {
    const r = await embedMany({ model: m, values: texts, maxRetries: 1 });
    addUsage(r.usage.tokens, 0, estimateCost(embedder.provider, embedder.model, { inputTokens: r.usage.tokens }, prices));
    return r.embeddings;
  };
}

/**
 * Embedding function that matches the vectors already stored. Vectors from
 * different models cannot be compared, so on a mismatch this returns
 * undefined and search falls back to keywords.
 */
/** Material for one step: the track's stored resource pack when it has one (no search), else a library search. */
export async function stepHits(planId: string, objective: Objective): Promise<Hit[]> {
  const { course, kb } = services();
  const pack = await course.resources(planId);
  if (pack?.objectives[objective.id]) return packHits(pack, objective.id);
  return kb.size ? kb.search(objectiveQuery(objective), 5, await kbEmbed()) : [];
}

export async function kbEmbed(): Promise<Embed | undefined> {
  const s = services();
  const key = embedderKey();
  if (!key) return undefined;
  if (s.kbEmbedder ? s.kbEmbedder !== key : s.kb.size > 0) return undefined;
  return embedFn();
}

export function embedderKey(): string {
  const e = useStore.getState().settings.embedder;
  return e?.model ? modelKey(e) : "";
}

/** Sends a tiny prompt to check the model answers. Returns the reply text.
 * The budget leaves room for reasoning models, which think before the one word. */
export async function testModel(c: ModelChoice): Promise<string> {
  const r = await generateText({ model: await model(c), prompt: "Reply with the single word: ready", maxRetries: 0, maxOutputTokens: 512 });
  addUsage(r.usage.inputTokens ?? 0, r.usage.outputTokens ?? 0, estimateCost(c.provider, c.model, r.usage, useStore.getState().settings.prices));
  return r.text.trim();
}

export async function discoverModels(provider: string, baseURL?: string): Promise<string[]> {
  return listModels({ provider, baseURL: baseURL || useStore.getState().settings.baseURLs[provider] }, await creds(provider), fetchFor(provider));
}

/** Learner-facing message for any thrown error. Never includes request headers. */
export function errorText(e: unknown): string {
  if (e instanceof NoModelError) return "no-model";
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/(sk|key)-[A-Za-z0-9_-]{8,}/g, "$1-…").slice(0, 400);
}
