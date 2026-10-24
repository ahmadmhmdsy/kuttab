// Web search for researched tracks (T-23). Builds the engine's WebAdapter from the
// learner's search choice: the visible search window (no key), the teacher
// provider's own search, or a search API with its own key. Keys come from the
// secret store at call time. Nothing reaches the web until the learner approves.
import type { WebAdapter } from "@kuttab/engine";
import { extractHtml, type Section } from "@kuttab/kb";
import { DUCKDUCKGO_RESULTS, duckDuckGoHits, duckDuckGoUrl, engineSearch, nativeSearch, nativeSearchProvider } from "@kuttab/llm-gateway";
import { keyId } from "./ai.ts";
import { services, useStore } from "./state.ts";

export const searchKeyId = (engine: string) => keyId(`search-${engine}`);

export class SearchDeclined extends Error {
  constructor() {
    super("search-declined");
  }
}

/** Splits page text into paragraphs; the knowledge base chunks them further. */
function textSections(text: string, locator: string): Section[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter((p) => p.length > 40);
  return paras.length ? [{ text: paras.join("\n\n"), locator }] : [];
}

/** Reads a page over plain HTTP. */
async function fetchPage(url: string): Promise<{ title: string; sections: Section[] }> {
  const res = await services().platform.fetch(url, { headers: { Accept: "text/html,*/*" } });
  if (!res.ok) throw new Error(`Could not open ${url} (${res.status}).`);
  return extractHtml(await res.text());
}

/**
 * The adapter for the learner's search choice, or undefined when search is off
 * or cannot work here. `approve` is asked once, before the first search.
 */
export function webAdapter(approve: () => boolean): WebAdapter | undefined {
  const { settings } = useStore.getState();
  const { platform } = services();
  const kind = settings.search.kind;
  let approved = false;
  const gate = () => {
    if (!approved && !(approved = approve())) throw new SearchDeclined();
  };

  if (kind === "off") return undefined;

  if (kind === "browser") {
    const win = platform.web;
    if (!win) return undefined;
    const visible = !settings.search.headless;
    return {
      async search(query, n) {
        gate();
        await win.open(duckDuckGoUrl(query), visible);
        const page = await win.capture(DUCKDUCKGO_RESULTS);
        const hits = duckDuckGoHits(page.links, n);
        // A challenge page has no results; the learner can solve it in the window and try again.
        if (!hits.length && !/no results/i.test(page.text)) {
          if (!visible) await win.show();
          throw new Error("The search page showed no results. If it asks you to prove you are human, do that in the search window, then try again.");
        }
        return hits;
      },
      async fetch(url) {
        gate();
        await win.open(url, visible);
        let page = await win.capture("a[href^='http']");
        // Pages that draw their text after load get one more look.
        if (page.text.length < 500) {
          await new Promise((r) => setTimeout(r, 2000));
          page = await win.capture("a[href^='http']");
        }
        return { title: page.title || url, sections: textSections(page.text, page.url) };
      },
    };
  }

  if (kind === "native") {
    const teacher = settings.teacher;
    const provider = teacher && nativeSearchProvider(teacher.provider);
    if (!teacher || !provider) return undefined;
    return {
      async search(query, n) {
        gate();
        const apiKey = await platform.secrets.get(keyId(teacher.provider));
        if (!apiKey) throw new Error("The teacher model has no API key saved.");
        return nativeSearch({ provider, apiKey, model: teacher.model }, query, n, platform.fetch);
      },
      fetch: async (url) => (gate(), fetchPage(url)),
    };
  }

  return {
    async search(query, n) {
      gate();
      const apiKey = await platform.secrets.get(searchKeyId(kind));
      return engineSearch({ id: kind, apiKey, baseURL: settings.search.searxngUrl }, query, n, platform.fetch);
    },
    fetch: async (url) => (gate(), fetchPage(url)),
  };
}
