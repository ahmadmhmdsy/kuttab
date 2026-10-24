// Web search for researched tracks. Two kinds live here, both plain HTTP with
// an injected `fetch`: key-based search APIs (Brave, Tavily, a SearXNG instance)
// and provider-native search, where the learner's own model provider runs the
// search (Gemini, OpenAI, Anthropic). The in-app browser route is in the app.
import type { FetchFn } from "./providers.ts";

export interface SearchHit {
  title: string;
  url: string;
  snippet?: string;
}

export type SearchEngineId = "brave" | "tavily" | "searxng";

export interface SearchEngineInfo {
  id: SearchEngineId;
  label: string;
  needsKey: boolean;
  /** Free tier or free to run; listed first. */
  free: boolean;
  help: string;
}

/** Free options first (decision 0002, item 4). */
export const SEARCH_ENGINES: SearchEngineInfo[] = [
  { id: "searxng", label: "SearXNG (your own instance)", needsKey: false, free: true, help: "https://docs.searxng.org" },
  { id: "brave", label: "Brave Search API", needsKey: true, free: true, help: "https://brave.com/search/api/" },
  { id: "tavily", label: "Tavily", needsKey: true, free: true, help: "https://app.tavily.com" },
];

export interface SearchEngineConfig {
  id: SearchEngineId;
  apiKey?: string;
  /** SearXNG base URL, e.g. http://localhost:8888 */
  baseURL?: string;
}

async function json(res: Response, what: string): Promise<any> {
  if (!res.ok) throw new Error(`${what} search failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** A key-based (or self-hosted) search API. */
export async function engineSearch(cfg: SearchEngineConfig, query: string, n: number, fetch: FetchFn): Promise<SearchHit[]> {
  switch (cfg.id) {
    case "brave": {
      if (!cfg.apiKey) throw new Error("Brave Search needs an API key.");
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}`;
      const data = await json(await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": cfg.apiKey } }), "Brave");
      return (data.web?.results ?? []).slice(0, n).map((r: any) => ({ title: r.title, url: r.url, snippet: strip(r.description) }));
    }
    case "tavily": {
      if (!cfg.apiKey) throw new Error("Tavily needs an API key.");
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ query, max_results: n }),
      });
      const data = await json(res, "Tavily");
      return (data.results ?? []).slice(0, n).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content }));
    }
    case "searxng": {
      const base = (cfg.baseURL ?? "").replace(/\/+$/, "");
      if (!base) throw new Error("SearXNG needs the address of your instance.");
      const data = await json(await fetch(`${base}/search?q=${encodeURIComponent(query)}&format=json`, { headers: { Accept: "application/json" } }), "SearXNG");
      return (data.results ?? []).slice(0, n).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content }));
    }
  }
}

export type NativeSearchProvider = "google" | "openai" | "anthropic";

/** Providers whose own API can search the web with the learner's model key. */
export function nativeSearchProvider(providerId: string): NativeSearchProvider | undefined {
  return providerId === "google" || providerId === "openai" || providerId === "anthropic" ? providerId : undefined;
}

export interface NativeSearchConfig {
  provider: NativeSearchProvider;
  apiKey: string;
  model: string;
}

const ASK = (q: string) => `Search the web for: ${q}\nList the most useful pages that explain this topic.`;

/** Provider-native search: the model runs its built-in web search tool; we keep the cited pages. */
export async function nativeSearch(cfg: NativeSearchConfig, query: string, n: number, fetch: FetchFn): Promise<SearchHit[]> {
  let hits: SearchHit[] = [];
  if (cfg.provider === "google") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: ASK(query) }] }], tools: [{ google_search: {} }] }),
    });
    const data = await json(res, "Gemini");
    const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    hits = chunks.filter((c: any) => c.web?.uri).map((c: any) => ({ title: c.web.title ?? c.web.uri, url: c.web.uri }));
  } else if (cfg.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, input: ASK(query), tools: [{ type: "web_search" }] }),
    });
    const data = await json(res, "OpenAI");
    for (const item of data.output ?? []) {
      for (const part of item.content ?? []) {
        for (const a of part.annotations ?? []) if (a.type === "url_citation") hits.push({ title: a.title ?? a.url, url: a.url });
      }
    }
  } else {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: cfg.model, max_tokens: 1024, messages: [{ role: "user", content: ASK(query) }], tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }] }),
    });
    const data = await json(res, "Anthropic");
    for (const block of data.content ?? []) {
      if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
      for (const r of block.content) if (r.url) hits.push({ title: r.title ?? r.url, url: r.url });
    }
  }
  const seen = new Set<string>();
  return hits.filter((h) => !seen.has(h.url) && seen.add(h.url)).slice(0, n);
}

function strip(s: unknown): string | undefined {
  return typeof s === "string" ? s.replace(/<[^>]+>/g, "") : undefined;
}

/** The no-JavaScript DuckDuckGo page the in-app search window opens. */
export const duckDuckGoUrl = (query: string) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
/** Result links on that page. */
export const DUCKDUCKGO_RESULTS = "a.result__a";

/** Turns result links read from the DuckDuckGo page into hits. Its links go through
 * a redirect (`/l/?uddg=<real url>`), and ad links point back at DuckDuckGo. */
export function duckDuckGoHits(links: { text: string; href: string }[], n: number): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const l of links) {
    let url: URL;
    try {
      url = new URL(l.href, "https://duckduckgo.com");
    } catch {
      continue;
    }
    const real = url.searchParams.get("uddg");
    if (real) url = new URL(real);
    if (!/^https?:$/.test(url.protocol) || /(^|\.)duckduckgo\.com$/.test(url.hostname)) continue;
    if (hits.some((h) => h.url === url.href)) continue;
    hits.push({ title: l.text || url.href, url: url.href });
    if (hits.length >= n) break;
  }
  return hits;
}
