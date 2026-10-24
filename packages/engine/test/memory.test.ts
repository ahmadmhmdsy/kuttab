import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { FACTS_PER_SCOPE, addFacts, learnFromSession, llmBrain, memoryText, sessionFacts, type LearnerMemory, type LessonRecord } from "../src/index.ts";

const check = { question: "Which is bigger, 1/2 or 1/4?", choices: ["1/2", "1/4"], answer: "1/2" };
const rec: LessonRecord = {
  id: "r", lang: "en", title: "Fractions", trackId: "p1", startedAt: 0, beats: [],
  entries: [
    { at: 1, kind: "question", text: "Why eighths?" },
    { at: 2, kind: "check", check, beat: 0 },
    { at: 3, kind: "answer", beat: 0, answer: "1/4", correct: false, feedback: "" },
    { at: 4, kind: "check", check: { ...check, question: "Is 2/4 equal to 1/2?", choices: ["yes", "no"], answer: "yes" }, beat: 1 },
    { at: 5, kind: "answer", beat: 1, answer: "no", correct: false, feedback: "" },
    { at: 6, kind: "answer", beat: 1, answer: "yes", correct: true, feedback: "" },
  ],
};

function model(reply: () => unknown) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(reply()) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
      warnings: [],
    }),
  });
}

describe("learner memory", () => {
  it("addFacts skips known facts in the same scope and trims each scope, keeping the learner's own", () => {
    let mem: LearnerMemory = addFacts({ facts: [] }, [{ text: "Likes worked examples", from: "you" }], 1);
    mem = addFacts(mem, [{ text: "likes  worked examples ", from: "session" }, { text: "Likes worked examples", trackId: "p1", from: "session" }], 2);
    expect(mem.facts.map((f) => [f.text, f.trackId])).toEqual([["Likes worked examples", undefined], ["Likes worked examples", "p1"]]);
    const many = Array.from({ length: FACTS_PER_SCOPE + 5 }, (_, i) => ({ text: `fact ${i}`, from: "session" as const }));
    mem = addFacts(mem, many, 3);
    const global = mem.facts.filter((f) => !f.trackId);
    expect(global).toHaveLength(FACTS_PER_SCOPE);
    expect(global.some((f) => f.from === "you")).toBe(true);
    expect(mem.facts.filter((f) => f.trackId === "p1")).toHaveLength(1);
  });

  it("memoryText gives global facts and only this track's facts", () => {
    const mem = addFacts({ facts: [] }, [
      { text: "Prefers Arabic examples", from: "chat" },
      { text: "Mixes up halves and quarters", trackId: "p1", from: "session" },
      { text: "Forgets semicolons", trackId: "p2", from: "session" },
    ]);
    expect(memoryText(mem, "p1")).toBe("- Prefers Arabic examples\nThis course:\n- Mixes up halves and quarters");
    expect(memoryText(mem)).toBe("- Prefers Arabic examples");
    expect(memoryText(undefined, "p1")).toBe("");
  });

  it("sessionFacts keeps checks the learner never got right", () => {
    expect(sessionFacts(rec)).toEqual([{ text: "Fractions: Which is bigger, 1/2 or 1/4?", trackId: "p1", from: "session" }]);
  });

  it("learnFromSession adds the model's facts in the right scope", async () => {
    const mem = await learnFromSession(
      { teacher: model(() => ({ facts: [{ text: "Asks why before how", scope: "global" }, { text: "Confuses 1/2 and 1/4", scope: "track" }] })) },
      rec,
      { facts: [] },
      "en",
    );
    expect(mem.facts.map((f) => [f.text, f.trackId, f.from])).toEqual([
      ["Asks why before how", undefined, "session"],
      ["Confuses 1/2 and 1/4", "p1", "session"],
    ]);
  });

  it("llmBrain reads the learner memory into its system prompt", async () => {
    const teacher = model(() => ({ done: true }));
    const brain = llmBrain({ teacher }, "en", { material: "Fractions", learner: "- Likes worked examples" });
    await brain.nextBeat({ ...rec, entries: [] });
    expect(JSON.stringify(teacher.doGenerateCalls[0]?.prompt)).toContain("Likes worked examples");
  });

  it("learnFromSession falls back to the record when the model fails", async () => {
    const mem = await learnFromSession({ teacher: model(() => { throw new Error("offline"); }) }, rec, { facts: [] }, "en");
    expect(mem.facts.map((f) => f.text)).toEqual(["Fractions: Which is bigger, 1/2 or 1/4?"]);
  });
});
