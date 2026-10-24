// In-browser models. WebLLM speaks an OpenAI-shaped API in-process, so a fetch
// shim on webllm://local/v1 lets the regular OpenAI-compatible provider use it.
// The library and the weights load only when the learner picks a WebLLM model.
import type { FetchFn } from "@kuttab/llm-gateway";

type Engine = import("@mlc-ai/web-llm").MLCEngine;

export interface WebLlmProgress {
  model: string;
  progress: number;
  text: string;
}

let engine: { model: string; ready: Promise<Engine> } | null = null;
const listeners = new Set<(p: WebLlmProgress) => void>();

export function onWebLlmProgress(fn: (p: WebLlmProgress) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export async function webLlmModels(): Promise<{ id: string; vramMB?: number }[]> {
  const { prebuiltAppConfig } = await import("@mlc-ai/web-llm");
  return prebuiltAppConfig.model_list.map((m) => ({ id: m.model_id, vramMB: m.vram_required_MB }));
}

function load(model: string): Promise<Engine> {
  if (engine?.model === model) return engine.ready;
  const previous = engine;
  const ready = (async () => {
    if (previous) await (await previous.ready.catch(() => null))?.unload();
    if (!hasWebGpu()) throw new Error("WebGPU is not available, so in-browser models cannot run here");
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
    return CreateMLCEngine(model, {
      initProgressCallback: (r) => listeners.forEach((fn) => fn({ model, progress: r.progress, text: r.text })),
    });
  })();
  engine = { model, ready };
  ready.catch(() => {
    if (engine?.ready === ready) engine = null;
  });
  return ready;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function webLlmFetch(fallback: FetchFn): FetchFn {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("webllm://")) return fallback(input, init);
    const path = url.replace(/^webllm:\/\/local\/v1/, "");
    try {
      if (path === "/models") return json({ data: (await webLlmModels()).map((m) => ({ id: m.id })) });
      if (path !== "/chat/completions") return json({ error: { message: `Unsupported path ${path}` } }, 404);
      const body = JSON.parse(String(init?.body ?? "{}"));
      const eng = await load(body.model);
      const req: Record<string, unknown> = {
        messages: body.messages,
        temperature: body.temperature,
        top_p: body.top_p,
        max_tokens: body.max_tokens,
        seed: body.seed,
      };
      const rf = body.response_format;
      if (rf?.type === "json_schema") req.response_format = { type: "json_object", schema: JSON.stringify(rf.json_schema?.schema ?? {}) };
      else if (rf?.type === "json_object") req.response_format = { type: "json_object" };
      if (!body.stream) return json(await eng.chat.completions.create({ ...req, stream: false } as never));
      const chunks = await eng.chat.completions.create({ ...req, stream: true, stream_options: { include_usage: true } } as never);
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        async start(ctrl) {
          for await (const c of chunks as unknown as AsyncIterable<unknown>) ctrl.enqueue(enc.encode(`data: ${JSON.stringify(c)}\n\n`));
          ctrl.enqueue(enc.encode("data: [DONE]\n\n"));
          ctrl.close();
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
    } catch (e) {
      return json({ error: { message: (e as Error).message } }, 500);
    }
  }) as FetchFn;
}
