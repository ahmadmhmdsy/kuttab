// Thin helpers over the AI SDK. The engine receives ready LanguageModel objects
// (built by @kuttab/llm-gateway) and never sees keys, URLs or fetch.
import { generateText, Output, streamText, type LanguageModel } from "ai";
import { z } from "zod";
import type { Lang } from "./schema.ts";

export interface UsageEvent {
  role: "teacher" | "grader";
  task: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface Ctx {
  teacher: LanguageModel;
  /** Defaults to the teacher model. */
  grader?: LanguageModel;
  onUsage?: (u: UsageEvent) => void;
  signal?: AbortSignal;
}

export const LANG_NAME: Record<Lang, string> = { en: "English", ar: "Modern Standard Arabic" };

export function languageRule(lang: Lang): string {
  return lang === "ar"
    ? "Write every learner-facing string in Modern Standard Arabic. Keep code, SQL keywords, identifiers and program output in English/ASCII exactly as they must be typed."
    : "Write every learner-facing string in clear, plain English.";
}

/**
 * Structured generation with repair. Small local models sometimes return JSON
 * that misses the schema; we retry with the validation error in the prompt (S6).
 */
export async function structured<S extends z.ZodType>(
  ctx: Ctx,
  role: "teacher" | "grader",
  task: string,
  schema: S,
  system: string,
  prompt: string,
  attempts = 3,
): Promise<z.infer<S>> {
  const model = role === "grader" ? (ctx.grader ?? ctx.teacher) : ctx.teacher;
  // Providers without native structured output (OpenRouter, OpenCode Go) only get
  // response_format json_object, so the schema must travel in the instructions.
  let shape = "";
  try {
    shape = `

Reply with one JSON object only, no prose or code fences, matching this JSON Schema:
${JSON.stringify(z.toJSONSchema(schema))}`;
  } catch {
    // Some zod features have no JSON Schema form; the provider's own mode still applies.
  }
  const instructions = system + shape;
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await generateText({
        model,
        output: Output.object({ schema }),
        instructions,
        prompt: lastErr ? `${prompt}\n\nYour previous answer was rejected: ${lastErr.slice(0, 600)}\nReturn JSON that matches the schema exactly.` : prompt,
        maxRetries: 1,
        abortSignal: ctx.signal,
      });
      ctx.onUsage?.({ role, task, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens });
      return r.output as z.infer<S>;
    } catch (e) {
      if (ctx.signal?.aborted) throw e;
      lastErr = e instanceof Error ? e.message : String(e);
      if (i === attempts - 1) throw new Error(`The model could not produce a valid ${task} after ${attempts} tries: ${lastErr}`);
    }
  }
  throw new Error("unreachable");
}

/** Streams plain text (explanations, tutor chat). */
export async function* streamProse(ctx: Ctx, role: "teacher" | "grader", task: string, system: string, prompt: string): AsyncGenerator<string> {
  const model = role === "grader" ? (ctx.grader ?? ctx.teacher) : ctx.teacher;
  const r = streamText({ model, instructions: system, prompt, abortSignal: ctx.signal });
  for await (const t of r.textStream) yield t;
  const usage = await r.usage;
  ctx.onUsage?.({ role, task, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
}

export async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let s = "";
  for await (const t of gen) s += t;
  return s;
}
