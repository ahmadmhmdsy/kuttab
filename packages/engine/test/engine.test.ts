import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { KnowledgeBase } from "@kuttab/kb";
import { createNodeLabs } from "@kuttab/labs/node";
import {
  Course,
  MemoryStore,
  addObjective,
  askGrounded,
  dueCards,
  exportPack,
  generateLesson,
  generatePlan,
  itemState,
  liveStreak,
  markStudied,
  moveObjective,
  newReviewCard,
  nextObjective,
  parsePack,
  planFromObjectives,
  rateCard,
  recordEvidence,
  removeObjective,
  setStatus,
  type LearnerProfile,
} from "../src/index.ts";

function mockModel(...replies: unknown[]) {
  const queue = [...replies];
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: typeof queue[0] === "string" ? (queue.shift() as string) : JSON.stringify(queue.shift()) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

const profile: LearnerProfile = { lang: "en", goal: "query data at work", level: "new", minutesPerDay: 20, style: "examples-first" };
const objs = [
  { id: "select", title: "SELECT", summary: "Read columns", prereqs: [] },
  { id: "where", title: "WHERE", summary: "Filter rows", prereqs: ["select"] },
  { id: "order", title: "ORDER BY", summary: "Sort rows", prereqs: ["select"] },
];

describe("plan and pacing", () => {
  it("sorts, edits and paces an objective graph", () => {
    const plan = planFromObjectives("p", "SQL", [objs[1], objs[0], objs[2]]);
    expect(plan.items.map((i) => i.id)).toEqual(["select", "where", "order"]);
    expect(() => planFromObjectives("p", "x", [{ id: "a", title: "", summary: "", prereqs: ["b"] }, { id: "b", title: "", summary: "", prereqs: ["a"] }])).toThrow(/cycle/);
    let m = {};
    expect(nextObjective(plan, m)?.id).toBe("select");
    expect(itemState(plan, m, plan.items[1])).toBe("locked");
    // Skipping an objective unlocks what depends on it.
    expect(itemState(setStatus(plan, "select", "skipped"), m, plan.items[1])).toBe("available");
    for (let i = 0; i < 6; i++) m = recordEvidence(m, "select", "exercise", true);
    expect(itemState(plan, m, plan.items[0])).toBe("mastered");
    expect(nextObjective(plan, m)?.id).toBe("where");
    expect(moveObjective(plan, "where", -1)).toBe(plan); // would break a prerequisite
    expect(moveObjective(plan, "order", -1).items.map((i) => i.id)).toEqual(["select", "order", "where"]);
    const removed = removeObjective(plan, "select");
    expect(removed.items.find((i) => i.id === "where")?.prereqs).toEqual([]);
    expect(() => addObjective(plan, { id: "join", title: "", summary: "", prereqs: ["nope"] })).toThrow(/unknown/);
  });

  it("schedules reviews and keeps a streak", () => {
    const t0 = new Date("2026-10-18T10:00:00+03:00");
    let c = newReviewCard("p", "select", "b1", t0);
    expect(dueCards([c], t0)).toHaveLength(1);
    c = rateCard(c, "good", t0);
    expect(dueCards([c], t0)).toHaveLength(0);
    expect(new Date(c.due).getTime()).toBeGreaterThan(t0.getTime());
    let s = markStudied({ current: 0, best: 0 }, new Date(2026, 9, 18, 9));
    s = markStudied(s, new Date(2026, 9, 18, 22));
    s = markStudied(s, new Date(2026, 9, 19, 8));
    expect(s.current).toBe(2);
    expect(liveStreak(s, new Date(2026, 9, 21))).toBe(0);
  });
});

describe("course store", () => {
  it("caches lessons once and turns checks into review cards", async () => {
    const course = new Course(new MemoryStore());
    let calls = 0;
    const gen = async () => {
      calls++;
      return { objectiveId: "select", title: "SELECT", lang: "en" as const, blocks: [{ type: "explain" as const, markdown: "hi" }] };
    };
    await Promise.all([course.lessonOrGenerate("p", "select", gen), course.lessonOrGenerate("p", "select", gen)]);
    await course.lessonOrGenerate("p", "select", gen);
    expect(calls).toBe(1);
    const now = new Date("2026-10-18T10:00:00Z");
    await course.record("p", "select", "check", false, "select-3", now);
    // A miss comes back after a short relearning step.
    expect(await course.due(new Date(now.getTime() + 60 * 60_000))).toHaveLength(1);
    expect((await course.streak()).current).toBe(1);
  });
});

describe("teacher with a mock model", () => {
  it("repairs a sloppy plan", async () => {
    const teacher = mockModel({
      title: "SQL",
      objectives: [
        { id: "Select Basics!", title: "SELECT", summary: "s", prereqs: ["later"], lab: "sql" },
        { id: "where", title: "WHERE", summary: "w", prereqs: ["Select Basics!"], lab: "none" },
      ],
    });
    const p = await generatePlan({ teacher }, profile, "SQL");
    expect(p.objectives).toEqual([
      { id: "select-basics", title: "SELECT", summary: "s", prereqs: [], lab: "sql" },
      { id: "where", title: "WHERE", summary: "w", prereqs: ["select-basics"], lab: undefined },
    ]);
  });

  it("retries invalid JSON, and keeps only exercises whose solution passes", async () => {
    const blank = { markdown: "", code: "", question: "", choices: [], answer: -1, explanation: "", setup: "", solution: "", tests: "" };
    const setup = "CREATE TABLE t(x INT); INSERT INTO t VALUES (1),(2);";
    const teacher = mockModel("not json at all", {
      title: "SELECT",
      cited: [],
      blocks: [
        { ...blank, type: "explain", markdown: "SELECT reads columns." },
        { ...blank, type: "check", question: "Which keyword reads?", choices: ["SELECT", "DROP"], answer: 0, explanation: "SELECT reads." },
        { ...blank, type: "exercise", question: "Read x", setup, solution: "SELECT x FROM t" },
        { ...blank, type: "exercise", question: "Broken", setup, solution: "SELEC x FROM t" },
        { ...blank, type: "recap", markdown: "Done." },
      ],
    });
    const labs = createNodeLabs();
    const plan = planFromObjectives("p", "SQL", [{ ...objs[0], lab: "sql" }]);
    const lesson = await generateLesson({ teacher }, { planId: "p", objective: plan.items[0], profile, lang: "en", labs });
    labs.dispose();
    expect(lesson.blocks.map((b) => b.type)).toEqual(["explain", "check", "exercise", "recap"]);
  });

  it("answers from sources with citations and refuses off-topic questions", async () => {
    const kb = new KnowledgeBase();
    await kb.add({ id: "s1", title: "SQL notes", kind: "markdown", addedAt: "2026-10-18T00:00:00+03:00" }, [{ text: "HAVING filters groups after GROUP BY.", locator: "Groups" }]);
    const teacher = mockModel({ answerable: true, answer: "HAVING filters groups [1].", cited: [1] });
    const a = await askGrounded({ teacher }, kb, "What does HAVING filter?", "en");
    expect(a.refused).toBe(false);
    expect(a.citations[0]).toMatchObject({ n: 1, sourceId: "s1", locator: "Groups" });
    const b = await askGrounded({ teacher: mockModel() }, kb, "Who painted the Mona Lisa?", "en");
    expect(b.refused).toBe(true);
  });
});

describe("packs", () => {
  it("round-trips a plan as a .kuttab pack and rejects bad packs", () => {
    const plan = planFromObjectives("my-sql", "My SQL", objs);
    const text = exportPack(plan, [{ objectiveId: "select", title: "SELECT", lang: "en", blocks: [{ type: "recap", markdown: "x" }], generatedBy: "m" }], { description: "d", lang: "en" });
    const pack = parsePack(text);
    expect(pack.objectives).toHaveLength(3);
    expect(pack.lessons[0]).not.toHaveProperty("generatedBy");
    expect(() => parsePack("{")).toThrow(/JSON/);
    expect(() => parsePack(JSON.stringify({ ...pack, lessons: [{ ...pack.lessons[0], objectiveId: "nope" }] }))).toThrow(/unknown objective/);
  });
});
