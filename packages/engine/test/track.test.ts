import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { KnowledgeBase } from "@kuttab/kb";
import { Course, MemoryStore, buildTrack, packHits, searchMore, type LearnerProfile, type WebAdapter } from "../src/index.ts";

const profile: LearnerProfile = { goal: "read charts", level: "new", minutesPerDay: 20, style: "examples-first", lang: "en" };
const plan = {
  title: "Photosynthesis",
  objectives: [
    { id: "light", title: "Light reactions", summary: "How chlorophyll captures light energy", prereqs: [], lab: "none" },
    { id: "calvin", title: "Calvin cycle", summary: "How carbon dioxide becomes sugar", prereqs: ["light"], lab: "none" },
  ],
};

/** Answers the research-queries prompt and the plan prompt; counts calls. */
function model() {
  return new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      const text = JSON.stringify(prompt).includes("web search queries") ? { queries: ["photosynthesis light reactions", "calvin cycle explained"] } : plan;
      return {
        content: [{ type: "text", text: JSON.stringify(text) }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
        warnings: [],
      };
    },
  });
}

const PAGES: Record<string, { title: string; text: string }> = {
  "https://bio.example/light": { title: "Light reactions", text: "Chlorophyll captures light energy in the thylakoid. Light reactions split water and make ATP." },
  "https://bio.example/calvin": { title: "The Calvin cycle", text: "The Calvin cycle fixes carbon dioxide into sugar using ATP from the light reactions." },
};

function fakeWeb() {
  const calls = { search: [] as string[], fetch: [] as string[] };
  const web: WebAdapter = {
    async search(q) {
      calls.search.push(q);
      return q.includes("calvin")
        ? [{ title: "Calvin", url: "https://bio.example/calvin" }, { title: "Light again", url: "https://bio.example/light#top" }]
        : [{ title: "Light", url: "https://bio.example/light" }];
    },
    async fetch(url) {
      calls.fetch.push(url);
      const p = PAGES[url];
      if (!p) throw new Error("404");
      return { title: p.title, sections: [{ text: p.text }] };
    },
  };
  return { web, calls };
}

async function ownLibrary() {
  const kb = new KnowledgeBase();
  await kb.add({ id: "notes", title: "My notes", kind: "text", addedAt: "2026-01-01" }, [{ text: "Chlorophyll absorbs red and blue light. Light reactions happen in the thylakoid membrane." }]);
  return kb;
}

describe("track builder", () => {
  it("researches once, then the stored pack teaches every objective with no network", async () => {
    const { web, calls } = fakeWeb();
    const kb = await ownLibrary();
    const built = await buildTrack({ teacher: model() }, { topic: "photosynthesis", profile, mix: "mine-then-web", kb, web, makeId: () => "photo" });

    expect(built.plan.id).toBe("photo");
    expect(calls.search).toEqual(["photosynthesis light reactions", "calvin cycle explained"]);
    // The "#top" duplicate is fetched once.
    expect(calls.fetch.sort()).toEqual(["https://bio.example/calvin", "https://bio.example/light"]);
    const calvin = built.pack.objectives.calvin!;
    expect(calvin.some((e) => e.url === "https://bio.example/calvin")).toBe(true);
    expect(built.pack.objectives.light!.some((e) => e.sourceId === "notes")).toBe(true);
    // Notes mode keeps excerpts and links only.
    expect(built.added).toEqual([]);
    expect(kb.listSources().map((s) => s.id)).toEqual(["notes"]);

    // Saved, reloaded from storage, used again: no search or fetch happens.
    const store = new MemoryStore();
    const course = new Course(store);
    await course.savePlan(built.plan);
    await course.saveResources(built.pack);
    const before = { ...calls, search: [...calls.search], fetch: [...calls.fetch] };
    const again = await new Course(store).resources("photo");
    const hits = packHits(again, "calvin");
    expect(hits[0]!.source.origin).toBe("https://bio.example/calvin");
    expect(hits[0]!.chunk.text).toContain("carbon dioxide");
    expect(calls).toEqual(before);

    await course.deletePlan("photo");
    expect(await course.resources("photo")).toBeUndefined();
  });

  it("only-mine never touches the web; keep-pages adds web pages to the library", async () => {
    const mine = fakeWeb();
    const own = await buildTrack({ teacher: model() }, { topic: "photosynthesis", profile, mix: "mine", kb: await ownLibrary(), web: mine.web });
    expect(mine.calls).toEqual({ search: [], fetch: [] });
    expect(own.pack.objectives.light!.every((e) => e.sourceId === "notes")).toBe(true);

    const pages = fakeWeb();
    const kb = await ownLibrary();
    const kept = await buildTrack({ teacher: model() }, { topic: "photosynthesis", profile, mix: "mine-then-web", keep: "pages", kb, web: pages.web });
    expect(kept.added.map((s) => s.origin).sort()).toEqual(["https://bio.example/calvin", "https://bio.example/light"]);
    expect(kb.listSources().filter((s) => s.kind === "url")).toHaveLength(2);
  });

  it("asks for the web but has no adapter: builds from own sources and says so", async () => {
    const built = await buildTrack({ teacher: model() }, { topic: "photosynthesis", profile, mix: "mine-then-web", kb: await ownLibrary() });
    expect(built.webSkipped).toBe(true);
    expect(built.pack.queries).toEqual([]);
  });

  it("a mid-track web search is honoured even on an only-mine track", async () => {
    const { web, calls } = fakeWeb();
    const kb = await ownLibrary();
    const built = await buildTrack({ teacher: model() }, { topic: "photosynthesis", profile, mix: "mine", kb });
    const calvin = built.plan.items.find((o) => o.id === "calvin")!;
    const more = await searchMore({ pack: built.pack, objective: calvin, query: "calvin cycle explained", web, kb });
    expect(calls.search).toEqual(["calvin cycle explained"]);
    expect(more.found.some((e) => e.url === "https://bio.example/calvin")).toBe(true);
    expect(more.pack.objectives.calvin!.length).toBeGreaterThan(built.pack.objectives.calvin!.length);
    expect(more.pack.queries).toContain("calvin cycle explained");
    await expect(searchMore({ pack: built.pack, objective: calvin, query: "x", kb })).rejects.toThrow(/not set up/);
  });
});
