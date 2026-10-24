// What the tutor knows about the learner (decision 0002, item 17): short facts kept locally,
// learned from live-session notes and chat, read at session start, and editable by the learner.
// Self-improvement is this memory, not model training.
import { z } from "zod";
import { languageRule, structured, type Ctx } from "./llm.ts";
import type { Lang } from "./schema.ts";
import { lessonNotes, type LessonRecord } from "./session.ts";

export const MemoryFact = z.object({
  id: z.string(),
  text: z.string().min(1).max(200),
  /** The track (plan) this is about; none means it holds for every track. */
  trackId: z.string().optional(),
  from: z.enum(["session", "chat", "you"]),
  at: z.number(),
});
export type MemoryFact = z.infer<typeof MemoryFact>;

export const LearnerMemory = z.object({ facts: z.array(MemoryFact).default([]) });
export type LearnerMemory = z.infer<typeof LearnerMemory>;

/** Facts kept per scope (global, or one track); the oldest learned ones go first, the learner's own last. */
export const FACTS_PER_SCOPE = 30;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Adds facts, skipping ones already known in the same scope, and trims each scope to FACTS_PER_SCOPE. */
export function addFacts(mem: LearnerMemory, add: Omit<MemoryFact, "id" | "at">[], now = Date.now()): LearnerMemory {
  const facts = [...mem.facts];
  for (const [i, f] of add.entries()) {
    const text = f.text.trim().slice(0, 200);
    if (!text || facts.some((x) => x.trackId === f.trackId && norm(x.text) === norm(text))) continue;
    facts.push({ ...f, text, id: `${now.toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`, at: now });
  }
  const scopes = new Map<string, MemoryFact[]>();
  for (const f of facts) scopes.set(f.trackId ?? "", [...(scopes.get(f.trackId ?? "") ?? []), f]);
  const drop = new Set<string>();
  for (const list of scopes.values()) {
    const order = [...list].sort((a, b) => Number(a.from === "you") - Number(b.from === "you") || a.at - b.at);
    for (const f of order.slice(0, Math.max(0, list.length - FACTS_PER_SCOPE))) drop.add(f.id);
  }
  return { facts: facts.filter((f) => !drop.has(f.id)) };
}

/** The facts for a session in this track, as prompt text; empty when there are none. */
export function memoryText(mem: LearnerMemory | undefined, trackId?: string): string {
  const facts = mem?.facts ?? [];
  const global = facts.filter((f) => !f.trackId);
  const track = trackId ? facts.filter((f) => f.trackId === trackId) : [];
  const lines = [...global.map((f) => `- ${f.text}`), ...(track.length ? ["This course:", ...track.map((f) => `- ${f.text}`)] : [])];
  return lines.join("\n");
}

const Learned = z.object({
  facts: z.array(z.object({ text: z.string(), scope: z.enum(["global", "track"]) })).max(4),
});

/** Facts that follow from the record alone: checks the learner never got right. Used when no model is reachable. */
export function sessionFacts(rec: LessonRecord): Omit<MemoryFact, "id" | "at">[] {
  return lessonNotes(rec)
    .mistakes.filter((m) => !m.fixed)
    .slice(0, 3)
    .map((m) => ({ text: `${rec.title}: ${m.question}`.slice(0, 200), trackId: rec.trackId, from: "session" as const }));
}

/**
 * Asks the model what a finished live session showed about the learner (how they learn, what they find hard,
 * what they asked about), given what is already known so it does not repeat it. Falls back to sessionFacts.
 */
export async function learnFromSession(ctx: Ctx, rec: LessonRecord, mem: LearnerMemory, lang: Lang): Promise<LearnerMemory> {
  const notes = lessonNotes(rec);
  const known = memoryText(mem, rec.trackId) || "(nothing yet)";
  const summary = [
    `Lesson: ${rec.title}`,
    notes.questions.length ? `Learner questions:\n${notes.questions.map((q) => `- ${q.question}`).join("\n")}` : "",
    notes.mistakes.length
      ? `Mistakes:\n${notes.mistakes.map((m) => `- ${m.question} — answered ${m.wrong.join(", ")}; right: ${m.answer}${m.fixed ? " (fixed later)" : ""}`).join("\n")}`
      : "No mistakes.",
  ].filter(Boolean).join("\n\n");
  let add: Omit<MemoryFact, "id" | "at">[];
  try {
    const r = await structured(
      ctx,
      "teacher",
      "learn from session",
      Learned,
      `You keep a tutor's notes about one learner. Write at most 4 short, durable facts (one sentence each, under 25 words) that will help teach them better next time: what they find hard, how they like to learn, what interests them. Use "track" scope for facts about this course's subject, "global" for facts about the learner. Do not repeat known facts, do not record secrets or personal identifiers, and return no facts if nothing new was shown. ${languageRule(lang)}`,
      `Already known:\n${known}\n\nThis session:\n${summary}`,
    );
    add = r.facts.map((f) => ({ text: f.text, trackId: f.scope === "track" ? rec.trackId : undefined, from: "session" as const }));
  } catch (e) {
    if (ctx.signal?.aborted) throw e;
    add = sessionFacts(rec);
  }
  return addFacts(mem, add);
}
