import { describe, expect, it } from "vitest";
import { generateText } from "ai";
import { createModel, estimateCost, listModels, providerInfo, resolveBaseURL, type FetchFn } from "../src/index.ts";

function fakeFetch(handler: (url: string, init: RequestInit) => unknown): { fetch: FetchFn; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return new Response(JSON.stringify(handler(url, init)), { status: 200, headers: { "content-type": "application/json" } });
  }) as FetchFn;
  return { fetch, calls };
}

describe("llm-gateway", () => {
  it("routes an OpenAI-compatible local model through the injected fetch", async () => {
    const { fetch, calls } = fakeFetch(() => ({
      id: "x",
      object: "chat.completion",
      created: 0,
      model: "qwen3:8b",
      choices: [{ index: 0, message: { role: "assistant", content: "مرحبا" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    }));
    const model = createModel({ provider: "ollama", model: "qwen3:8b" }, {}, fetch);
    const r = await generateText({ model, prompt: "hi" });
    expect(r.text).toBe("مرحبا");
    expect(calls[0].url).toBe("http://localhost:11434/v1/chat/completions");
    expect(r.usage.inputTokens).toBe(5);
  });

  it("resolves base URLs and rejects unknown providers", () => {
    expect(resolveBaseURL({ provider: "lmstudio", baseURL: "http://127.0.0.1:9999/v1/" })).toBe("http://127.0.0.1:9999/v1");
    expect(() => resolveBaseURL({ provider: "custom" })).toThrow(/base URL/);
    expect(() => providerInfo("nope")).toThrow(/Unknown provider/);
  });

  it("estimates cost from catalog prices and overrides", () => {
    expect(estimateCost("openai", "gpt-5-mini", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(2.25);
    expect(estimateCost("anthropic", "claude-haiku-5-5", { inputTokens: 10 })).toBeUndefined();
    expect(estimateCost("ollama", "qwen3:8b", { inputTokens: 10 })).toBe(0);
    expect(estimateCost("anthropic", "claude-haiku-5-5", { inputTokens: 1_000_000, outputTokens: 0 }, { "anthropic:claude-haiku-5-5": { priceIn: 1, priceOut: 5 } })).toBeCloseTo(1);
  });

  it("lists models from OpenAI-style and Ollama-style responses", async () => {
    const a = fakeFetch(() => ({ data: [{ id: "b" }, { id: "a" }] }));
    expect(await listModels({ provider: "openai" }, { apiKey: "k" }, a.fetch)).toEqual(["a", "b"]);
    expect(new Headers(a.calls[0].init.headers).get("authorization")).toBe("Bearer k");
    const o = fakeFetch(() => ({ models: [{ name: "qwen3:8b" }] }));
    expect(await listModels({ provider: "ollama" }, {}, o.fetch)).toEqual(["qwen3:8b"]);
    const g = fakeFetch(() => ({ data: [{ id: "models/gemini-3.1-flash-lite" }] }));
    expect(await listModels({ provider: "google" }, { apiKey: "k" }, g.fetch)).toEqual(["gemini-3.1-flash-lite"]);
    expect(resolveBaseURL({ provider: "opencode-go" })).toBe("https://opencode.ai/zen/go/v1");
  });

  it("sends a stable x-opencode-session to OpenCode Go, and none elsewhere", async () => {
    const reply = () => ({ id: "x", object: "chat.completion", created: 0, model: "m", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }] });
    const oc = fakeFetch(reply);
    await generateText({ model: createModel({ provider: "opencode-go", model: "beam-free" }, { apiKey: "k" }, oc.fetch), prompt: "hi" });
    await generateText({ model: createModel({ provider: "opencode-go", model: "beam-free" }, { apiKey: "k" }, oc.fetch), prompt: "hi" });
    const sessions = oc.calls.map((c) => new Headers(c.init.headers).get("x-opencode-session"));
    expect(sessions[0]).toMatch(/^kuttab-/);
    expect(sessions[1]).toBe(sessions[0]);
    const ol = fakeFetch(reply);
    await generateText({ model: createModel({ provider: "ollama", model: "m" }, {}, ol.fetch), prompt: "hi" });
    expect(new Headers(ol.calls[0].init.headers).get("x-opencode-session")).toBeNull();
  });
});
