import { describe, expect, it } from "vitest";
import { duckDuckGoHits, duckDuckGoUrl, engineSearch, nativeSearch, nativeSearchProvider, type FetchFn } from "../src/index.ts";

/** Answers one URL prefix with a JSON body and records each request. */
function fakeFetch(prefix: string, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch: FetchFn = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (!url.startsWith(prefix)) return new Response("nope", { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { fetch, calls };
}

const header = (init: RequestInit | undefined, name: string) => new Headers(init?.headers).get(name);

describe("key-based search", () => {
  it("Brave sends the key header and returns results", async () => {
    const { fetch, calls } = fakeFetch("https://api.search.brave.com/", { web: { results: [{ title: "Calvin", url: "https://a.example/c", description: "<b>sugar</b> made" }] } });
    const hits = await engineSearch({ id: "brave", apiKey: "k" }, "calvin cycle", 5, fetch);
    expect(hits).toEqual([{ title: "Calvin", url: "https://a.example/c", snippet: "sugar made" }]);
    expect(header(calls[0]!.init, "X-Subscription-Token")).toBe("k");
    expect(calls[0]!.url).toContain("q=calvin%20cycle");
  });

  it("Tavily posts the query", async () => {
    const { fetch, calls } = fakeFetch("https://api.tavily.com/", { results: [{ title: "T", url: "https://t.example", content: "c" }] });
    expect(await engineSearch({ id: "tavily", apiKey: "k" }, "q", 3, fetch)).toEqual([{ title: "T", url: "https://t.example", snippet: "c" }]);
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ query: "q", max_results: 3 });
  });

  it("SearXNG uses the learner's instance, no key", async () => {
    const { fetch, calls } = fakeFetch("http://localhost:8888/search", { results: [{ title: "S", url: "https://s.example", content: "x" }] });
    expect(await engineSearch({ id: "searxng", baseURL: "http://localhost:8888/" }, "q", 3, fetch)).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://localhost:8888/search?q=q&format=json");
  });

  it("explains a missing key or address, and reports HTTP errors", async () => {
    const { fetch } = fakeFetch("https://nowhere/", {});
    await expect(engineSearch({ id: "brave" }, "q", 3, fetch)).rejects.toThrow(/API key/);
    await expect(engineSearch({ id: "searxng" }, "q", 3, fetch)).rejects.toThrow(/address/);
    await expect(engineSearch({ id: "tavily", apiKey: "k" }, "q", 3, fetch)).rejects.toThrow(/Tavily search failed \(404\)/);
  });
});

describe("provider-native search", () => {
  it("maps model providers that can search", () => {
    expect(nativeSearchProvider("google")).toBe("google");
    expect(nativeSearchProvider("ollama")).toBeUndefined();
  });

  it("Gemini: grounding chunks become hits, deduped", async () => {
    const chunk = (uri: string) => ({ web: { uri, title: "page" } });
    const { fetch, calls } = fakeFetch("https://generativelanguage.googleapis.com/", { candidates: [{ groundingMetadata: { groundingChunks: [chunk("https://g/1"), chunk("https://g/1"), chunk("https://g/2")] } }] });
    const hits = await nativeSearch({ provider: "google", apiKey: "k", model: "gemini-2.5-flash" }, "q", 5, fetch);
    expect(hits.map((h) => h.url)).toEqual(["https://g/1", "https://g/2"]);
    expect(JSON.parse(String(calls[0]!.init!.body)).tools).toEqual([{ google_search: {} }]);
  });

  it("OpenAI: url citations become hits", async () => {
    const { fetch } = fakeFetch("https://api.openai.com/", { output: [{ content: [{ annotations: [{ type: "url_citation", url: "https://o/1", title: "O" }] }] }] });
    expect(await nativeSearch({ provider: "openai", apiKey: "k", model: "gpt-5" }, "q", 5, fetch)).toEqual([{ title: "O", url: "https://o/1" }]);
  });

  it("Anthropic: web search results become hits", async () => {
    const { fetch } = fakeFetch("https://api.anthropic.com/", { content: [{ type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://a/1", title: "A" }] }] });
    expect(await nativeSearch({ provider: "anthropic", apiKey: "k", model: "claude-sonnet-5-5" }, "q", 5, fetch)).toEqual([{ title: "A", url: "https://a/1" }]);
  });
});

describe("duckDuckGoHits", () => {
  it("decodes redirect links, drops ads and duplicates", () => {
    const links = [
      { text: "Photosynthesis - Wikipedia", href: "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FPhotosynthesis&rut=x" },
      { text: "Ad", href: "https://duckduckgo.com/y.js?ad_provider=bing" },
      { text: "Again", href: "//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FPhotosynthesis" },
      { text: "Khan", href: "https://www.khanacademy.org/science/photosynthesis" },
      { text: "Third", href: "https://example.org/3" },
    ];
    expect(duckDuckGoHits(links, 2)).toEqual([
      { title: "Photosynthesis - Wikipedia", url: "https://en.wikipedia.org/wiki/Photosynthesis" },
      { title: "Khan", url: "https://www.khanacademy.org/science/photosynthesis" },
    ]);
    expect(duckDuckGoUrl("a b")).toBe("https://html.duckduckgo.com/html/?q=a%20b");
  });
});
