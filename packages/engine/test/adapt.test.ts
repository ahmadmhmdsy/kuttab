import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { OFF_PLAN_AFTER, dialectRule, llmBrain, offPlan, paceFor, paceSignals, type LessonRecord, type RecordEntry } from "../src/index.ts";

const check = { question: "Is 2/4 equal to 1/2?", choices: ["yes", "no"], answer: "yes" };
const base: LessonRecord = { id: "r", lang: "en", title: "Fractions", startedAt: 0, beats: [], entries: [] };

/** A teaching beat with a check; a missed first try is followed by a right one. */
function checked(beat: number, firstRight: boolean): RecordEntry[] {
  const e: RecordEntry[] = [
    { at: beat, kind: "say", text: `step ${beat}`, beat },
    { at: beat, kind: "check", check, beat },
    { at: beat, kind: "answer", beat, answer: firstRight ? "yes" : "no", correct: firstRight, feedback: "" },
  ];
  if (!firstRight) e.push({ at: beat, kind: "answer", beat, answer: "yes", correct: true, feedback: "" });
  return e;
}
const rec = (...entries: RecordEntry[][]): LessonRecord => ({ ...base, entries: entries.flat() });
const side = (q: string): RecordEntry[] => [
  { at: 9, kind: "question", text: q },
  { at: 9, kind: "reply", text: "answer" },
  { at: 9, kind: "say", text: "answer", beat: 99 },
];

function model() {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify({ done: false, beat: { say: "Next." }, say: "Sure." }) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
      warnings: [],
    }),
  });
}
const promptOf = (m: MockLanguageModelV4, i = 0) => JSON.stringify(m.doGenerateCalls[i]?.prompt);

describe("live adaptation", () => {
  it("a run of missed checks slows the pace; a run of first-try answers speeds it up", () => {
    expect(paceFor(paceSignals(rec(checked(0, true))))).toBe("steady");
    expect(paceFor(paceSignals(rec(checked(0, true), checked(1, false), checked(2, false))))).toBe("slower");
    expect(paceFor(paceSignals(rec(checked(0, false), checked(1, true), checked(2, true), checked(3, true))))).toBe("faster");
    // Getting one right after a slow patch brings it back to steady.
    expect(paceFor(paceSignals(rec(checked(0, false), checked(1, false), checked(2, true))))).toBe("steady");
  });

  it("before any check, mastery from earlier sessions sets the opening pace", () => {
    expect(paceFor(paceSignals(base, 0.7))).toBe("faster");
    expect(paceFor(paceSignals(base, 0.2))).toBe("slower");
    expect(paceFor(paceSignals(base, 0))).toBe("steady");
    expect(paceFor(paceSignals(rec(checked(0, false), checked(1, false)), 0.9))).toBe("slower");
  });

  it("side questions count until the lesson moves on", () => {
    const qs = Array.from({ length: OFF_PLAN_AFTER }, (_, i) => side(`q${i}`));
    expect(offPlan(paceSignals(rec(checked(0, true), ...qs)))).toBe(true);
    expect(offPlan(paceSignals(rec(...qs, checked(1, true))))).toBe(false);
    // A teaching beat the learner cut off does not count as moving on.
    const cut: RecordEntry = { at: 5, kind: "say", text: "step", beat: 5, interrupted: true };
    expect(paceSignals(rec(side("a"), [cut], side("b"))).sideQuestions).toBe(2);
  });

  it("llmBrain changes its next-beat prompt when the signals change", async () => {
    const struggling = model();
    await llmBrain({ teacher: struggling }, "en", { material: "Fractions" }).nextBeat(rec(checked(0, false), checked(1, false)));
    expect(promptOf(struggling)).toContain("slow down");

    const flying = model();
    await llmBrain({ teacher: flying }, "en", { material: "Fractions" }).nextBeat(rec(checked(0, true), checked(1, true), checked(2, true)));
    expect(promptOf(flying)).toContain("move faster");

    const steady = model();
    await llmBrain({ teacher: steady }, "en", { material: "Fractions" }).nextBeat(rec(checked(0, true)));
    expect(promptOf(steady)).not.toMatch(/slow down|move faster/);

    const known = model();
    await llmBrain({ teacher: known }, "en", { material: "Fractions", level: 0.75 }).nextBeat(base);
    expect(promptOf(known)).toContain("move faster");
  });

  it("llmBrain steers back to the plan after several side questions", async () => {
    const m = model();
    const brain = llmBrain({ teacher: m }, "en", { material: "Fractions" });
    const asked = (n: number) => rec(checked(0, true), ...Array.from({ length: n - 1 }, (_, i) => side(`q${i}`)), [{ at: 10, kind: "question", text: "last" }]);
    await brain.reply(asked(1), "last");
    await brain.reply(asked(OFF_PLAN_AFTER), "last");
    expect(promptOf(m, 0)).not.toContain("back to the lesson");
    expect(promptOf(m, 1)).toContain("back to the lesson");
  });
  it("an Arabic dialect shapes the spoken lines only, and only in Arabic", async () => {
    expect(dialectRule("ar", "egyptian")).toContain("Egyptian Arabic");
    expect(dialectRule("ar", "egyptian")).toContain("Modern Standard Arabic");
    expect(dialectRule("ar", "msa")).toBe("");
    expect(dialectRule("en", "gulf")).toBe("");

    const egyptian = model();
    await llmBrain({ teacher: egyptian }, "ar", { material: "Fractions", dialect: "egyptian" }).nextBeat({ ...base, lang: "ar" });
    expect(promptOf(egyptian)).toContain("everyday Egyptian Arabic");
    const msa = model();
    await llmBrain({ teacher: msa }, "ar", { material: "Fractions" }).nextBeat({ ...base, lang: "ar" });
    expect(promptOf(msa)).not.toContain("everyday");
  });
});
