// Platform-neutral provider factory. This module MUST NOT import Tauri (or any
// other platform API): the caller injects `fetch`, so the same code runs in a
// Tauri WebView (tauri-plugin-http), in Node, or in a test with a fake fetch.
// `pnpm check:neutral` enforces the no-Tauri rule.
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type ProviderId = "openai" | "anthropic" | "ollama";
export type FetchFn = typeof globalThis.fetch;

export interface ProviderConfig {
  provider: ProviderId;
  model: string;
  /** Held in memory only. Never persisted by this module. */
  apiKey?: string;
  /** Override for tests or a non-default Ollama host. */
  baseURL?: string;
}

export const PROVIDERS: ProviderId[] = ["openai", "anthropic", "ollama"];

export const DEFAULTS: Record<ProviderId, { model: string; baseURL: string; needsKey: boolean }> = {
  openai: { model: "gpt-5-mini", baseURL: "https://api.openai.com/v1", needsKey: true },
  anthropic: { model: "claude-haiku-5-5", baseURL: "https://api.anthropic.com/v1", needsKey: true },
  ollama: { model: "llama3.2", baseURL: "http://localhost:11434/v1", needsKey: false },
};

export function createModel(cfg: ProviderConfig, fetch: FetchFn): LanguageModel {
  const baseURL = cfg.baseURL ?? DEFAULTS[cfg.provider].baseURL;
  switch (cfg.provider) {
    case "openai":
      return createOpenAI({ apiKey: cfg.apiKey ?? "", baseURL, fetch })(cfg.model);
    case "anthropic":
      return createAnthropic({ apiKey: cfg.apiKey ?? "", baseURL, fetch })(cfg.model);
    case "ollama":
      // Ollama's OpenAI-compatible endpoint accepts response_format json_schema.
      return createOpenAICompatible({
        name: "ollama",
        baseURL,
        fetch,
        supportsStructuredOutputs: true,
      })(cfg.model);
  }
}
