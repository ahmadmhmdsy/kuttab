import { PROVIDERS } from "./providers.ts";

// The curated model list. Recommendations, not restrictions: the learner can
// use any model id a provider accepts, star favorites, and keep a custom list.
// Prices are USD per million tokens, approximate, and editable in Settings;
// `undefined` means unknown, and the cost meter then shows tokens only.

/** image: models that draw pictures for the teacher (T-27). */
export type Role = "teacher" | "grader" | "embedder" | "image";

export interface CatalogModel {
  provider: string;
  model: string;
  label: string;
  roles: Role[];
  /** "small" models (about 8B) are viable for packs and grading (S6). */
  size: "small" | "medium" | "large";
  arabic: "good" | "fair" | "weak";
  priceIn?: number;
  priceOut?: number;
  note?: string;
  /** false when the model cannot call tools; the tutor then answers in plain chat. */
  tools?: false;
  /** Download size in GB, for local models. */
  gb?: number;
}

export const CATALOG: CatalogModel[] = [
  { provider: "anthropic", model: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", roles: ["teacher"], size: "large", arabic: "good", note: "Strong teacher, excellent Arabic" },
  { provider: "anthropic", model: "claude-haiku-5-5", label: "Claude Haiku 5.5", roles: ["teacher", "grader"], size: "medium", arabic: "good", note: "Fast and cheap" },
  { provider: "openai", model: "gpt-5-mini", label: "GPT-5 mini", roles: ["teacher", "grader"], size: "medium", arabic: "good", priceIn: 0.25, priceOut: 2 },
  { provider: "openai", model: "gpt-5", label: "GPT-5", roles: ["teacher"], size: "large", arabic: "good", priceIn: 1.25, priceOut: 10 },
  { provider: "openai", model: "text-embedding-3-small", label: "text-embedding-3-small", roles: ["embedder"], size: "small", arabic: "good", priceIn: 0.02, priceOut: 0 },
  { provider: "google", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash", roles: ["teacher", "grader"], size: "medium", arabic: "good", priceIn: 0.3, priceOut: 2.5 },
  { provider: "google", model: "gemini-2.5-pro", label: "Gemini 2.5 Pro", roles: ["teacher"], size: "large", arabic: "good", priceIn: 1.25, priceOut: 10 },
  { provider: "google", model: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", roles: ["teacher", "grader"], size: "medium", arabic: "good", note: "Cheapest Gemini; has a free tier" },
  { provider: "opencode-go", model: "longcat-2.5-preview-free", label: "LongCat 2.5 preview (free)", roles: ["teacher", "grader"], size: "large", arabic: "fair", priceIn: 0, priceOut: 0, note: "Free while in preview" },
  { provider: "opencode-go", model: "beam-free", label: "Beam (free)", roles: ["teacher", "grader"], size: "medium", arabic: "fair", priceIn: 0, priceOut: 0, note: "Free" },
  { provider: "ollama", model: "qwen3:14b", label: "Qwen3 14B (local)", roles: ["teacher", "grader"], size: "medium", arabic: "good", gb: 9.3, note: "About 9 GB; needs 16 GB of memory or more" },
  { provider: "ollama", model: "qwen3:8b", label: "Qwen3 8B (local)", roles: ["teacher", "grader"], size: "small", arabic: "fair", gb: 5.2, note: "About 5 GB download; best local all-rounder" },
  { provider: "ollama", model: "llama3.2", label: "Llama 3.2 3B (local)", roles: ["grader"], size: "small", arabic: "weak", tools: false, gb: 2, note: "About 2 GB; English grading on low-end machines" },
  { provider: "ollama", model: "gemma3:4b", label: "Gemma 3 4B (local)", roles: ["teacher", "grader"], size: "small", arabic: "fair", gb: 3.3, note: "About 3 GB" },
  { provider: "ollama", model: "bge-m3", label: "BGE-M3 embeddings (local)", roles: ["embedder"], size: "small", arabic: "good", gb: 1.2, note: "Multilingual; about 1.2 GB" },
  { provider: "ollama", model: "nomic-embed-text", label: "nomic-embed-text (local)", roles: ["embedder"], size: "small", arabic: "weak", gb: 0.27, note: "About 270 MB; English only" },
  { provider: "google", model: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image", roles: ["image"], size: "medium", arabic: "fair", note: "Draws diagrams and pictures; paid per image" },
  { provider: "google", model: "imagen-4.0-generate-001", label: "Imagen 4", roles: ["image"], size: "large", arabic: "weak", note: "Photo-like pictures; paid per image" },
  { provider: "openai", model: "gpt-image-1", label: "GPT Image 1", roles: ["image"], size: "large", arabic: "fair", note: "Paid per image" },
  { provider: "webllm", model: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B (in-browser)", roles: ["grader"], size: "small", arabic: "fair", tools: false, gb: 1, note: "Needs WebGPU; about 1 GB cached by the app" },
];

/** Unknown models are assumed to call tools; the tutor falls back to plain chat if a call fails. */
export function supportsTools(provider: string, model: string): boolean {
  if (provider === "webllm") return false;
  return CATALOG.find((m) => m.provider === provider && m.model === model)?.tools !== false;
}

export interface UsageLike {
  inputTokens?: number;
  outputTokens?: number;
}

export interface PriceOverride {
  priceIn?: number;
  priceOut?: number;
}

/** Cost in USD, or undefined when the price is unknown. */
export function estimateCost(provider: string, model: string, usage: UsageLike, overrides: Record<string, PriceOverride> = {}): number | undefined {
  const key = `${provider}:${model}`;
  if (PROVIDERS.find((p) => p.id === provider)?.kind !== "cloud" && !overrides[key]) return 0;
  const base = CATALOG.find((m) => m.provider === provider && m.model === model);
  const priceIn = overrides[key]?.priceIn ?? base?.priceIn;
  const priceOut = overrides[key]?.priceOut ?? base?.priceOut;
  if (priceIn === undefined || priceOut === undefined) return undefined;
  return ((usage.inputTokens ?? 0) * priceIn + (usage.outputTokens ?? 0) * priceOut) / 1_000_000;
}
