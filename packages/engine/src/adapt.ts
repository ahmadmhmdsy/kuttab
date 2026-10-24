// Live adaptation (decision 0002, items 10 and 11). There is no placement quiz:
// the tutor reads the lesson record as it goes and changes pace. A run of missed
// checks slows it down, a run of first-try answers speeds it up, and a string of
// side questions while the lesson stands still brings it back to the plan.
import type { LessonRecord } from "./session.ts";

export type Pace = "slower" | "steady" | "faster";

export interface PaceSignals {
  /** First-try result of each check, in order. */
  firstTry: boolean[];
  /** Checks missed on the first try, counted back from the latest. */
  missedRun: number;
  /** Checks right on the first try, counted back from the latest. */
  rightRun: number;
  /** Learner questions since the lesson last moved on (a full teaching beat or an answer). */
  sideQuestions: number;
  /** Mastery score of this objective from earlier sessions, if any. */
  level?: number;
}

/** Missed checks in a row that slow the tutor down. */
export const SLOW_AFTER = 2;
/** First-try answers in a row that speed it up. */
export const FAST_AFTER = 3;
/** Side questions in a row before the tutor steers back to the plan. */
export const OFF_PLAN_AFTER = 3;

export function paceSignals(rec: LessonRecord, level?: number): PaceSignals {
  const first = new Map<number, boolean>();
  let sideQuestions = 0;
  let inReply = false;
  for (const e of rec.entries) {
    if (e.kind === "answer") {
      if (!first.has(e.beat)) first.set(e.beat, e.correct);
      sideQuestions = 0;
    } else if (e.kind === "question") sideQuestions++;
    else if (e.kind === "reply") inReply = true;
    else if (e.kind === "say") {
      // A reply's own speech, or a beat the learner cut off, does not move the lesson on.
      if (!inReply && !e.interrupted) sideQuestions = 0;
      inReply = false;
    }
  }
  const firstTry = [...first.values()];
  const run = (want: boolean) => {
    let n = 0;
    for (let i = firstTry.length - 1; i >= 0 && firstTry[i] === want; i--) n++;
    return n;
  };
  return { firstTry, missedRun: run(false), rightRun: run(true), sideQuestions, ...(level !== undefined ? { level } : {}) };
}

/** Recent checks decide; before there are any, the level from earlier sessions does. */
export function paceFor(s: PaceSignals): Pace {
  if (s.missedRun >= SLOW_AFTER) return "slower";
  if (s.rightRun >= FAST_AFTER) return "faster";
  if (!s.firstTry.length && s.level !== undefined) return s.level >= 0.6 ? "faster" : s.level > 0 && s.level < 0.3 ? "slower" : "steady";
  return "steady";
}

export function offPlan(s: PaceSignals): boolean {
  return s.sideQuestions >= OFF_PLAN_AFTER;
}

const PACE_RULE: Record<Pace, string> = {
  slower: "The learner is struggling: slow down, take a smaller step, use a simple concrete example, and re-check the same idea in an easier way before moving on.",
  steady: "",
  faster: "The learner is getting things right first time: move faster, skip what they already know, and make the next check a little harder.",
};

/** Pace line for the tutor's next teaching beat; empty when nothing needs to change. */
export function paceRule(s: PaceSignals): string {
  return PACE_RULE[paceFor(s)];
}

/** Steering line for a reply: after several side questions, answer briefly and lead back to the lesson. */
export function backToPlanRule(s: PaceSignals): string {
  return offPlan(s) ? "The learner has asked several side questions while the lesson stood still: answer this one briefly, then kindly bring them back to the lesson and say what comes next." : "";
}
