// Platform-neutral checks for spike T-3: transport, streamed text, generateObject.
import { APICallError, generateObject, streamText } from "ai";
import { z } from "zod";
import { createModel, DEFAULTS, type FetchFn, type ProviderConfig, type ProviderId } from "./providers.ts";

export type CheckId = "transport" | "stream" | "object";
export type Status = "PASS" | "FAIL" | "SKIPPED";

export interface CheckResult {
  provider: ProviderId;
  check: CheckId;
  status: Status;
  detail: string;
  ms: number;
}

type Outcome = Omit<CheckResult, "ms">;

/** The small schema T-3 asks for. */
export const LessonCard = z.object({
  topic: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  keyPoints: z.array(z.string()).min(1).max(5),
});

const STREAM_PROMPT = "Count from 1 to 5, one number per line, nothing else.";
const OBJECT_PROMPT = "Describe a beginner lesson on Python list comprehensions.";

function describe(e: unknown): string {
  if (APICallError.isInstance(e)) {
    return `HTTP ${e.statusCode ?? "?"}: ${(e.responseBody ?? e.message).slice(0, 300)}`;
  }
  return (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 300);
}

async function timed(provider: ProviderId, check: CheckId, fn: () => Promise<Outcome>): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    return { ...(await fn()), ms: Date.now() - t0 };
  } catch (e) {
    return { provider, check, status: "FAIL", detail: describe(e), ms: Date.now() - t0 };
  }
}

/**
 * Proves the request reaches the provider and the response body is readable,
 * without a real key: a deliberately invalid key must come back as a provider
 * 401/403. A CORS block would surface as a TypeError, never as an HTTP status.
 */
export function transportCheck(provider: ProviderId, fetch: FetchFn, baseURL?: string): Promise<CheckResult> {
  return timed(provider, "transport", async () => {
    if (provider === "ollama") {
      const root = (baseURL ?? DEFAULTS.ollama.baseURL).replace(/\/v1\/?$/, "");
      const res = await fetch(`${root}/api/version`);
      const body = await res.text();
      return { provider, check: "transport", status: res.ok ? "PASS" : "FAIL", detail: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const model = createModel({ provider, model: DEFAULTS[provider].model, apiKey: "invalid-key-transport-probe", baseURL }, fetch);
    try {
      await generateObject({ model, schema: LessonCard, prompt: "hi", maxRetries: 0 });
      return { provider, check: "transport", status: "FAIL", detail: "an invalid key was accepted" };
    } catch (e) {
      if (APICallError.isInstance(e) && (e.statusCode === 401 || e.statusCode === 403)) {
        return { provider, check: "transport", status: "PASS", detail: `provider answered ${describe(e)}` };
      }
      throw e;
    }
  });
}

export function streamCheck(cfg: ProviderConfig, fetch: FetchFn, onDelta: (t: string) => void): Promise<CheckResult> {
  return timed(cfg.provider, "stream", async () => {
    const result = streamText({ model: createModel(cfg, fetch), prompt: STREAM_PROMPT, maxRetries: 0 });
    let deltas = 0;
    let text = "";
    let streamError: unknown;
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        deltas++;
        text += part.text;
        onDelta(part.text);
      } else if (part.type === "error") {
        streamError = part.error;
      }
    }
    if (streamError) throw streamError;
    // More than one delta is what distinguishes a stream from a buffered reply.
    return { provider: cfg.provider, check: "stream", status: deltas > 1 ? "PASS" : "FAIL", detail: `${deltas} deltas: ${JSON.stringify(text.slice(0, 80))}` };
  });
}

export function objectCheck(cfg: ProviderConfig, fetch: FetchFn): Promise<CheckResult> {
  return timed(cfg.provider, "object", async () => {
    const { object } = await generateObject({ model: createModel(cfg, fetch), schema: LessonCard, prompt: OBJECT_PROMPT, maxRetries: 0 });
    const ok = LessonCard.safeParse(object).success;
    return { provider: cfg.provider, check: "object", status: ok ? "PASS" : "FAIL", detail: JSON.stringify(object).slice(0, 200) };
  });
}

export function skipped(provider: ProviderId, check: CheckId, why: string): CheckResult {
  return { provider, check, status: "SKIPPED", detail: why, ms: 0 };
}

/** Runs all three checks for one provider, skipping model calls when no key is given. */
export async function runProvider(cfg: ProviderConfig, fetch: FetchFn, onDelta: (t: string) => void): Promise<CheckResult[]> {
  const transport = await transportCheck(cfg.provider, fetch, cfg.baseURL);
  const out = [transport];
  if (DEFAULTS[cfg.provider].needsKey && !cfg.apiKey) {
    out.push(skipped(cfg.provider, "stream", "no API key entered"), skipped(cfg.provider, "object", "no API key entered"));
    return out;
  }
  if (cfg.provider === "ollama" && transport.status !== "PASS") {
    const why = `Ollama not reachable (${transport.detail})`;
    return [skipped(cfg.provider, "transport", why), skipped(cfg.provider, "stream", why), skipped(cfg.provider, "object", why)];
  }
  out.push(await streamCheck(cfg, fetch, onDelta));
  out.push(await objectCheck(cfg, fetch));
  return out;
}
