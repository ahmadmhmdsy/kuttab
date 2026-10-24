// Local models (T-26, decision 0002 items 7 and 16): what this machine can run,
// which local servers are up, linking Hugging Face models through Ollama, and
// pulling them. Nothing here downloads unless the caller asks, and the app asks
// the learner first. Fetch is injected, as everywhere in this package.
import { CATALOG, type CatalogModel } from "./catalog.ts";
import { PROVIDERS, type FetchFn } from "./providers.ts";

export interface Hardware {
  /** Total memory in GB. */
  ramGb: number;
  /** Free disk where models are kept, in GB; undefined when unknown. */
  diskFreeGb?: number;
  cpus?: number;
  /** A WebGPU adapter was found. */
  gpu?: boolean;
  gpuName?: string;
}

export type WhisperSize = "tiny" | "base" | "small";

export interface LocalPlan {
  tier: "tiny" | "small" | "medium" | "large";
  /** The suggested local teacher, or undefined when the machine is better off in-browser or in the cloud. */
  teacher?: CatalogModel;
  /** Smaller models that also fit, largest first. */
  alternatives: CatalogModel[];
  embedder?: CatalogModel;
  whisper: WhisperSize;
  /** Low-compute mode: the model writes a section once and a voice reads it. */
  lowCompute: boolean;
  /** GB to download for the suggested teacher, embedder and Whisper. */
  downloadGb: number;
  /** false when the suggested download does not fit on the disk (with 2 GB to spare). */
  fitsDisk: boolean;
}

const ollama = (model: string) => CATALOG.find((m) => m.provider === "ollama" && m.model === model);
const WHISPER_GB: Record<WhisperSize, number> = { tiny: 0.04, base: 0.08, small: 0.25 };

/**
 * Recommends model sizes before anything is downloaded. Memory decides the
 * tier; a model should take at most about half of it so the app, the voice and
 * the system still fit.
 */
export function recommendLocal(hw: Hardware): LocalPlan {
  const ram = hw.ramGb;
  const tier: LocalPlan["tier"] = ram < 6 ? "tiny" : ram < 12 ? "small" : ram < 24 ? "medium" : "large";
  const ladder = ["qwen3:14b", "qwen3:8b", "gemma3:4b", "llama3.2"].map(ollama).filter((m): m is CatalogModel => !!m);
  const fits = ladder.filter((m) => (m.gb ?? 0) * 2 <= ram);
  const prefer: Record<LocalPlan["tier"], string[]> = { tiny: [], small: ["gemma3:4b", "llama3.2"], medium: ["qwen3:8b", "gemma3:4b"], large: ["qwen3:14b", "qwen3:8b"] };
  const teacher = prefer[tier].map((id) => fits.find((m) => m.model === id)).find((m) => !!m);
  const embedder = ollama(ram < 8 ? "nomic-embed-text" : "bge-m3");
  const whisper: WhisperSize = ram < 8 ? "tiny" : ram < 16 ? "base" : "small";
  const downloadGb = Math.round(((teacher?.gb ?? 0) + (embedder?.gb ?? 0) + WHISPER_GB[whisper]) * 10) / 10;
  return {
    tier,
    teacher,
    alternatives: fits.filter((m) => m !== teacher),
    embedder,
    whisper,
    lowCompute: tier === "tiny" || tier === "small",
    downloadGb,
    fitsDisk: hw.diskFreeGb === undefined || hw.diskFreeGb >= downloadGb + 2,
  };
}

export interface LocalServer {
  provider: string;
  baseURL: string;
  models: string[];
}

/** Probes the known local servers (Ollama, LM Studio, llama.cpp); a server that does not answer in time is left out. */
export async function detectLocalServers(fetch: FetchFn, timeoutMs = 1500): Promise<LocalServer[]> {
  const found = await Promise.all(
    PROVIDERS.filter((p) => p.kind === "local").map(async (p): Promise<LocalServer | undefined> => {
      try {
        const res = await fetch(`${p.baseURL}/models`, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) return undefined;
        const body = (await res.json()) as { data?: { id: string }[] };
        return { provider: p.id, baseURL: p.baseURL, models: (body.data ?? []).map((m) => m.id) };
      } catch {
        return undefined;
      }
    }),
  );
  return found.filter((s): s is LocalServer => !!s);
}

/** True for loopback addresses, so a custom OpenAI-compatible server on this machine counts as local. */
export function isLocalURL(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || host.endsWith(".localhost") || /^127\./.test(host);
  } catch {
    return false;
  }
}

/** Runs without the network: a local or in-browser provider, or a custom server on this machine. */
export function isLocalModel(ref: { provider: string; baseURL?: string }): boolean {
  const kind = PROVIDERS.find((p) => p.id === ref.provider)?.kind;
  if (ref.baseURL) return isLocalURL(ref.baseURL);
  return kind === "local" || kind === "in-browser";
}

/**
 * Turns a Hugging Face link into the name Ollama pulls it by:
 * "https://huggingface.co/user/repo", "hf.co/user/repo:Q4_K_M" or "user/repo"
 * all become "hf.co/user/repo[:quant]". Returns undefined for anything else.
 */
export function hfToOllama(input: string): string | undefined {
  const s = input.trim().replace(/^https?:\/\//, "").replace(/^(www\.)?(huggingface\.co|hf\.co)\//, "");
  const m = /^([\w.-]+)\/([\w.-]+?)(?:\/(?:tree|blob|resolve)\/[^:]*)?(?::([\w.-]+))?\/?$/.exec(s);
  if (!m) return undefined;
  return `hf.co/${m[1]}/${m[2]}${m[3] ? `:${m[3]}` : ""}`;
}

export interface GgufFile {
  file: string;
  /** Quantization tag Ollama accepts after the colon, e.g. "Q4_K_M". */
  quant?: string;
  gb: number;
}

/** Lists a Hugging Face repo's GGUF files with their sizes, so the learner sees the download before pulling. */
export async function hfGgufFiles(repo: string, fetch: FetchFn): Promise<GgufFile[]> {
  const name = (hfToOllama(repo) ?? repo).replace(/^hf\.co\//, "").replace(/:.*$/, "");
  const res = await fetch(`https://huggingface.co/api/models/${name}?blobs=true`);
  if (!res.ok) throw new Error(`Hugging Face: ${res.status} for ${name}`);
  const body = (await res.json()) as { siblings?: { rfilename: string; size?: number }[] };
  return (body.siblings ?? [])
    .filter((f) => f.rfilename.toLowerCase().endsWith(".gguf") && !/mmproj/i.test(f.rfilename))
    .map((f) => ({
      file: f.rfilename,
      quant: /[-_.]((?:I?Q\d[\w]*)|F16|BF16|F32)\.gguf$/i.exec(f.rfilename)?.[1]?.toUpperCase(),
      gb: Math.round(((f.size ?? 0) / 1e9) * 10) / 10,
    }))
    .sort((a, b) => a.gb - b.gb);
}

const ollamaRoot = (baseURL: string) => baseURL.replace(/\/+$/, "").replace(/\/v1$/, "");

/** The models Ollama already has, with their sizes on disk. */
export async function ollamaModels(baseURL: string, fetch: FetchFn): Promise<{ name: string; gb: number }[]> {
  const res = await fetch(`${ollamaRoot(baseURL)}/api/tags`);
  if (!res.ok) throw new Error(`Ollama: ${res.status}`);
  const body = (await res.json()) as { models?: { name: string; size?: number }[] };
  return (body.models ?? []).map((m) => ({ name: m.name, gb: Math.round(((m.size ?? 0) / 1e9) * 10) / 10 }));
}

export interface PullProgress {
  status: string;
  /** 0..1 when Ollama reports sizes. */
  fraction?: number;
}

/** Asks Ollama to download a model and reports progress. Call only after the learner agreed to the download. */
export async function pullOllama(baseURL: string, name: string, fetch: FetchFn, onProgress: (p: PullProgress) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${ollamaRoot(baseURL)}/api/pull`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: name, stream: true }), signal });
  if (!res.ok || !res.body) throw new Error(`Ollama pull: ${res.status} ${await res.text().catch(() => "")}`.trim());
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as { status?: string; error?: string; total?: number; completed?: number };
      if (msg.error) throw new Error(msg.error);
      onProgress({ status: msg.status ?? "", fraction: msg.total ? (msg.completed ?? 0) / msg.total : undefined });
    }
    if (done) return;
  }
}
