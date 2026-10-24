import { describe, expect, it } from "vitest";
import { KnowledgeBase, chunkSections, extractMarkdown, normalizeArabic, tokenize, type Source } from "../src/index.ts";

const src = (id: string, title = id): Source => ({ id, title, kind: "markdown", addedAt: "2026-10-18T00:00:00+03:00" });

describe("kb", () => {
  it("normalizes Arabic spelling variants and strips the article", () => {
    expect(normalizeArabic("إِسْتِعْلامٌ")).toBe("استعلام");
    expect(tokenize("الجداول والاستعلامات")).toEqual(tokenize("جداول استعلامات"));
    expect(tokenize("The tables are joined")).toEqual(["table", "joined"]);
  });

  it("chunks long text with headings kept as locators", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about joins.`).join(" ");
    const chunks = chunkSections("s", [{ text: long, locator: "Joins" }], 300, 50);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.text.length <= 360 && c.locator === "Joins")).toBe(true);
    const md = extractMarkdown("# Intro\nHello **world**\n\n## Joins\nA [join](x) combines rows.");
    expect(md).toEqual([{ text: "Hello world", locator: "Intro" }, { text: "A join combines rows.", locator: "Joins" }]);
  });

  it("ranks the relevant chunk first in English and Arabic, and survives a snapshot", async () => {
    const kb = new KnowledgeBase();
    await kb.add(src("sql"), extractMarkdown("# WHERE\nWHERE filters rows before grouping.\n\n# GROUP BY\nGROUP BY collapses rows into groups; HAVING filters groups."));
    await kb.add(src("ar"), [{ text: "تقوم جملة الترتيب ORDER BY بترتيب النتائج تصاعديا أو تنازليا.", locator: "الترتيب" }]);
    expect(kb.keywordSearch("how does HAVING filter groups")[0].chunk.locator).toBe("GROUP BY");
    expect(kb.keywordSearch("ترتيب النتائج")[0].source.id).toBe("ar");
    const again = KnowledgeBase.from(JSON.parse(JSON.stringify(kb.snapshot())));
    expect(again.keywordSearch("filters rows")[0].chunk.locator).toBe("WHERE");
    kb.remove("ar");
    expect(kb.keywordSearch("ترتيب")).toEqual([]);
    expect(kb.coverage("photosynthesis chlorophyll", kb.keywordSearch("photosynthesis chlorophyll"))).toBe(0);
  });

  it("fuses embedding similarity when an embedder is configured", async () => {
    // Toy embedder: one dimension per concept word.
    const vocab = ["cat", "dog", "car"];
    const embed = async (texts: string[]) => texts.map((t) => vocab.map((w) => (t.toLowerCase().includes(w) ? 1 : 0)));
    const kb = new KnowledgeBase();
    await kb.add(src("a"), [{ text: "A cat sleeps." }], embed);
    await kb.add(src("b"), [{ text: "A car drives." }], embed);
    const hits = await kb.search("cat", 2, embed);
    expect(hits[0].source.id).toBe("a");
  });
});
