import { providerInfo, resolveBaseURL, type Credentials, type FetchFn, type ModelRef } from "./providers.ts";

/** Lists model ids a provider currently offers (the "any model" picker). */
export async function listModels(ref: Omit<ModelRef, "model">, creds: Credentials, fetch: FetchFn): Promise<string[]> {
  const info = providerInfo(ref.provider);
  const headers: Record<string, string> = { ...info.headers?.() };
  if (info.api === "anthropic") {
    headers["x-api-key"] = creds.apiKey ?? "";
    headers["anthropic-version"] = "2023-06-01";
  } else if (creds.apiKey) {
    headers.Authorization = `Bearer ${creds.apiKey}`;
  }
  const res = await fetch(`${resolveBaseURL(ref)}/models`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} listing models`);
  const body = (await res.json()) as { data?: { id: string }[]; models?: { name: string }[] };
  // Google's OpenAI endpoint lists ids as "models/gemini-…"; chat wants the bare id.
  const ids = (body.data?.map((m) => m.id) ?? body.models?.map((m) => m.name) ?? []).map((id) => id.replace(/^models\//, ""));
  return [...new Set(ids)].sort();
}
