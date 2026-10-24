// Platform-neutral provider factory (grown from spike T-3). This module MUST NOT
// import Tauri or any platform API: the caller injects `fetch`, so the same code
// runs in the Tauri WebView (Rust HTTP), a browser, Node, or a test.
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModel, LanguageModel } from "ai";

export type FetchFn = typeof globalThis.fetch;

export type ProviderKind = "cloud" | "local" | "in-browser";

export interface ProviderInfo {
  id: string;
  label: string;
  kind: ProviderKind;
  baseURL: string;
  needsKey: boolean;
  /** Wire protocol the provider speaks. */
  api: "openai" | "anthropic" | "openai-compatible";
  /** Where to get a key or install the server. */
  help: string;
  embeddings: boolean;
  /** Extra request headers some providers require. */
  headers?: () => Record<string, string>;
}

// OpenCode Go rejects requests without x-opencode-session (400 MissingSessionID) and
// asks clients to name themselves. One id per app run keeps its prompt cache warm.
const RUN_ID = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const openCodeHeaders = () => ({ "x-opencode-session": `kuttab-${RUN_ID}`, "User-Agent": "Kuttab" });

export const PROVIDERS: ProviderInfo[] = [
  { id: "openai", label: "OpenAI", kind: "cloud", baseURL: "https://api.openai.com/v1", needsKey: true, api: "openai", help: "https://platform.openai.com/api-keys", embeddings: true },
  { id: "anthropic", label: "Anthropic", kind: "cloud", baseURL: "https://api.anthropic.com/v1", needsKey: true, api: "anthropic", help: "https://console.anthropic.com/settings/keys", embeddings: false },
  { id: "google", label: "Google Gemini", kind: "cloud", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", needsKey: true, api: "openai-compatible", help: "https://aistudio.google.com/apikey", embeddings: true },
  { id: "openrouter", label: "OpenRouter", kind: "cloud", baseURL: "https://openrouter.ai/api/v1", needsKey: true, api: "openai-compatible", help: "https://openrouter.ai/keys", embeddings: false },
  { id: "opencode-go", label: "OpenCode Go", kind: "cloud", baseURL: "https://opencode.ai/zen/go/v1", needsKey: true, api: "openai-compatible", help: "https://opencode.ai/auth", embeddings: false, headers: openCodeHeaders },
  { id: "ollama", label: "Ollama", kind: "local", baseURL: "http://localhost:11434/v1", needsKey: false, api: "openai-compatible", help: "https://ollama.com/download", embeddings: true },
  { id: "lmstudio", label: "LM Studio", kind: "local", baseURL: "http://localhost:1234/v1", needsKey: false, api: "openai-compatible", help: "https://lmstudio.ai", embeddings: true },
  { id: "llamacpp", label: "llama.cpp server", kind: "local", baseURL: "http://localhost:8080/v1", needsKey: false, api: "openai-compatible", help: "https://github.com/ggml-org/llama.cpp", embeddings: true },
  { id: "webllm", label: "In-browser (WebLLM)", kind: "in-browser", baseURL: "webllm://local/v1", needsKey: false, api: "openai-compatible", help: "https://webllm.mlc.ai", embeddings: false },
  { id: "custom", label: "Custom OpenAI-compatible", kind: "cloud", baseURL: "", needsKey: false, api: "openai-compatible", help: "", embeddings: true },
];

export function providerInfo(id: string): ProviderInfo {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider "${id}"`);
  return p;
}

export interface ModelRef {
  provider: string;
  model: string;
  /** Override (custom endpoint, non-default port). */
  baseURL?: string;
}

export interface Credentials {
  /** Held in memory only. Never persisted or logged by this package. */
  apiKey?: string;
}

export function resolveBaseURL(ref: Pick<ModelRef, "provider" | "baseURL">): string {
  const base = ref.baseURL || providerInfo(ref.provider).baseURL;
  if (!base) throw new Error(`Provider "${ref.provider}" needs a base URL`);
  return base.replace(/\/+$/, "");
}

export function createModel(ref: ModelRef, creds: Credentials, fetch: FetchFn): LanguageModel {
  const info = providerInfo(ref.provider);
  const baseURL = resolveBaseURL(ref);
  switch (info.api) {
    case "openai":
      return createOpenAI({ apiKey: creds.apiKey ?? "", baseURL, fetch })(ref.model);
    case "anthropic":
      return createAnthropic({ apiKey: creds.apiKey ?? "", baseURL, fetch })(ref.model);
    case "openai-compatible":
      return createOpenAICompatible({
        name: info.id,
        baseURL,
        apiKey: creds.apiKey || undefined,
        headers: info.headers?.(),
        fetch,
        supportsStructuredOutputs: info.id !== "openrouter" && info.id !== "opencode-go",
      })(ref.model);
  }
}

export function createEmbedder(ref: ModelRef, creds: Credentials, fetch: FetchFn): EmbeddingModel {
  const info = providerInfo(ref.provider);
  if (!info.embeddings) throw new Error(`${info.label} does not offer embeddings`);
  const baseURL = resolveBaseURL(ref);
  if (info.api === "openai") return createOpenAI({ apiKey: creds.apiKey ?? "", baseURL, fetch }).embeddingModel(ref.model);
  return createOpenAICompatible({ name: info.id, baseURL, apiKey: creds.apiKey || undefined, fetch }).embeddingModel(ref.model);
}
