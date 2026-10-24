// Local and low-cost live sessions (T-26, decision 0002 items 6 and 7).
// budgetCtx: a live session's own spending limit; when it runs out the session
// moves to the learner's local model (or stops spending if there is none).
// scriptBrain: low-compute mode — the main model writes the whole section in
// one call and the session reads it beat by beat, so a slow or small model is
// asked once instead of once per beat.
import type { LanguageModel } from "ai";
import { z } from "zod";
import { dialectRule, languageRule, structured, type Ctx, type Dialect, type UsageEvent } from "./llm.ts";
import type { Lang } from "./schema.ts";
import { BOARD_FORMATS, Beat, type Check, type LlmBrainOptions, type TutorBrain } from "./session.ts";

export interface BudgetOptions {
  /** USD for this session. */
  limit: number;
  /** Cost of one call on the session's (cloud) models; undefined when unknown. */
  cost(u: UsageEvent): number | undefined;
  /** The learner's local model. Without it, the session stops calling the cloud. */
  fallback?: { teacher: LanguageModel; grader?: LanguageModel };
  /** Called once, when the limit is reached: "local" after switching, "none" when there was nothing to switch to. */
  onSwitch(to: "local" | "none"): void;
}

export class BudgetSpentError extends Error {
  constructor() {
    super("budget-spent");
  }
}

export interface BudgetCtx extends Ctx {
  spent(): number;
  switched(): boolean;
}

/** Wraps a context so its calls stop at a spending limit. The models are swapped in place; calls read them each time. */
export function budgetCtx(base: Ctx, o: BudgetOptions): BudgetCtx {
  let spent = 0;
  let switched = false;
  let blocked = false;
  const ctx: BudgetCtx = {
    ...base,
    spent: () => spent,
    switched: () => switched,
    onUsage(u) {
      base.onUsage?.(u);
      if (switched) return;
      spent += o.cost(u) ?? 0;
      if (spent < o.limit) return;
      switched = true;
      if (o.fallback) {
        ctx.teacher = o.fallback.teacher;
        ctx.grader = o.fallback.grader;
        o.onSwitch("local");
      } else {
        blocked = true;
        o.onSwitch("none");
      }
    },
  };
  // With no local model the cloud models are fenced off, so nothing more is spent.
  const fence = (m: LanguageModel): LanguageModel =>
    typeof m === "string"
      ? m
      : new Proxy(m, {
          get(target, prop, recv) {
            if ((prop === "doGenerate" || prop === "doStream") && blocked) return () => Promise.reject(new BudgetSpentError());
            const v = Reflect.get(target, prop, recv);
            // Provider classes may keep private fields, so methods run on the real model.
            return typeof v === "function" ? v.bind(target) : v;
          },
        });
  ctx.teacher = fence(base.teacher);
  if (base.grader) ctx.grader = fence(base.grader);
  return ctx;
}

const Script = z.object({ beats: z.array(Beat).min(1).max(14) });

/**
 * Low-compute mode: one call writes the section as a script of beats; the
 * session reads them in order. Interruptions and free answers still ask the
 * model, but those are rare.
 */
export function scriptBrain(ctx: Ctx, lang: Lang, opts: LlmBrainOptions): TutorBrain {
  const rules = `${BOARD_FORMATS} ${languageRule(lang)}${dialectRule(lang, opts.dialect as Dialect | undefined)}`;
  const learner = opts.learner ? `\n\nWhat you know about this learner (use it; do not recite it):\n${opts.learner}` : "";
  let queue: z.infer<typeof Beat>[] | undefined;
  return {
    async nextBeat() {
      queue ??= (
        await structured(
          ctx,
          "teacher",
          "live script",
          Script,
          `${opts.teacher ?? "You are a patient tutor."} Write a whole short live lesson as a script of beats, to be read aloud. Each beat says one to three short spoken sentences (no markdown, no lists), may put something on the board, and every third or fourth beat asks a short check, preferably with choices. End with a one-line recap. ${rules}${learner}`,
          `Material:\n${opts.material}\n\nWrite ${opts.maxBeats ? `at most ${opts.maxBeats}` : "six to ten"} beats.`,
        )
      ).beats.slice(0, opts.maxBeats);
      return queue.shift() ?? null;
    },
    async reply(_rec, q) {
      return structured(ctx, "teacher", "live reply", Beat, `${opts.teacher ?? "You are a patient tutor."} Answer the learner's question in one to three short spoken sentences. ${rules}`, `Material:\n${opts.material}\n\nQuestion: "${q}"`);
    },
    async grade(_rec, check: Check, answer) {
      return structured(ctx, "grader", "live check", z.object({ correct: z.boolean(), feedback: z.string() }), `Grade a short answer kindly. Feedback is one spoken sentence. ${languageRule(lang)}`, `Question: ${check.question}\nExpected: ${check.answer}\nLearner: ${answer}`);
    },
  };
}
