import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { BudgetSpentError, LiveSession, budgetCtx, scriptBrain, structured, type Speaker } from "../src/index.ts";
import { z } from "zod";

/** A mock model that answers with the given JSON replies in order, and counts its calls. */
function mock(replies: unknown[]) {
  const m = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(replies.shift()) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 500, text: 500, reasoning: 0 } },
      warnings: [],
    }),
  });
  return m;
}

const speaker = (): { s: Speaker; spoken: string[] } => {
  const spoken: string[] = [];
  return { s: { speak: (t) => (spoken.push(t), Promise.resolve()) }, spoken };
};

const Out = z.object({ n: z.number() });
let clock = 0;
const now = () => ++clock;

describe("live budget", () => {
  it("moves to the local model once the session limit is spent", async () => {
    const cloud = mock([{ n: 1 }, { n: 2 }]);
    const local = mock([{ n: 3 }]);
    const switches: string[] = [];
    const ctx = budgetCtx({ teacher: cloud }, { limit: 0.015, cost: () => 0.01, fallback: { teacher: local }, onSwitch: (to) => switches.push(to) });
    expect((await structured(ctx, "teacher", "t", Out, "s", "p")).n).toBe(1);
    expect(switches).toEqual([]);
    expect((await structured(ctx, "teacher", "t", Out, "s", "p")).n).toBe(2);
    expect(switches).toEqual(["local"]);
    expect(ctx.switched()).toBe(true);
    expect((await structured(ctx, "teacher", "t", Out, "s", "p")).n).toBe(3);
    expect(cloud.doGenerateCalls).toHaveLength(2);
    expect(local.doGenerateCalls).toHaveLength(1);
    expect(ctx.spent()).toBeCloseTo(0.02);
  });

  it("stops calling the cloud when there is no local model", async () => {
    const cloud = mock([{ n: 1 }, { n: 2 }]);
    const switches: string[] = [];
    const ctx = budgetCtx({ teacher: cloud }, { limit: 0.01, cost: () => 0.01, onSwitch: (to) => switches.push(to) });
    await structured(ctx, "teacher", "t", Out, "s", "p");
    expect(switches).toEqual(["none"]);
    await expect(structured(ctx, "teacher", "t", Out, "s", "p")).rejects.toThrow();
    expect(cloud.doGenerateCalls).toHaveLength(1);
    expect(new BudgetSpentError().message).toBe("budget-spent");
  });

  it("keeps the app's usage counter and ignores unknown prices", async () => {
    const seen: string[] = [];
    const ctx = budgetCtx({ teacher: mock([{ n: 1 }]), onUsage: (u) => seen.push(u.task) }, { limit: 0.01, cost: () => undefined, onSwitch: () => {} });
    await structured(ctx, "teacher", "beat", Out, "s", "p");
    expect(seen).toEqual(["beat"]);
    expect(ctx.switched()).toBe(false);
  });
});

describe("low-compute script brain", () => {
  it("writes the section in one call and reads it beat by beat", async () => {
    const model = mock([
      {
        beats: [
          { say: "A fraction is part of a whole.", board: { kind: "math", content: "\\frac{1}{2}" } },
          { say: "Which is bigger?", check: { question: "1/2 or 1/4?", choices: ["1/2", "1/4"], answer: "1/2" } },
          { say: "So halves are bigger than quarters." },
        ],
      },
    ]);
    const { s, spoken } = speaker();
    const session = new LiveSession({ brain: scriptBrain({ teacher: model }, "en", { material: "fractions" }), speaker: s, lang: "en", title: "Fractions", now });
    await session.start();
    expect(session.state).toBe("awaiting_answer");
    const g = await session.answer("1/2");
    expect(g.correct).toBe(true);
    expect(session.state).toBe("done");
    expect(spoken).toContain("So halves are bigger than quarters.");
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("asks the model only for free answers and questions", async () => {
    const model = mock([
      { beats: [{ say: "Say it in your words.", check: { question: "What is a half?", answer: "one of two equal parts" } }] },
      { correct: true, feedback: "Yes, two equal parts." },
    ]);
    const { s, spoken } = speaker();
    const session = new LiveSession({ brain: scriptBrain({ teacher: model }, "en", { material: "fractions", maxBeats: 4 }), speaker: s, lang: "en", title: "Halves", now });
    await session.start();
    const g = await session.answer("two equal pieces, one of them");
    expect(g.correct).toBe(true);
    expect(spoken).toContain("Yes, two equal parts.");
    expect(model.doGenerateCalls).toHaveLength(2);
  });
});
