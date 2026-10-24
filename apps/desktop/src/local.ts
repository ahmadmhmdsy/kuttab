// What this machine has, for the local-model advice (T-26). The desktop shell
// reports memory, cores and free disk; the browser build falls back to
// navigator.deviceMemory, which is capped at 8 GB.
import { PROVIDERS, type Hardware } from "@kuttab/llm-gateway";
import { services, useStore } from "./state.ts";

type GpuNavigator = Navigator & {
  deviceMemory?: number;
  gpu?: { requestAdapter(): Promise<{ info?: { description?: string; vendor?: string; architecture?: string } } | null> };
};

export async function checkHardware(): Promise<Hardware> {
  const nav = navigator as GpuNavigator;
  const native = await services().platform.hardware?.().catch(() => undefined);
  let gpu = false;
  let gpuName: string | undefined;
  try {
    const adapter = await nav.gpu?.requestAdapter();
    if (adapter) {
      gpu = true;
      const i = adapter.info;
      gpuName = i?.description || [i?.vendor, i?.architecture].filter(Boolean).join(" ") || undefined;
    }
  } catch {
    // No WebGPU here; in-browser models will not run.
  }
  return {
    ramGb: Math.round(native?.ramGb ?? nav.deviceMemory ?? 4),
    diskFreeGb: native?.diskFreeGb === undefined ? undefined : Math.round(native.diskFreeGb),
    cpus: native?.cpus ?? navigator.hardwareConcurrency,
    gpu,
    gpuName,
  };
}

/** The Ollama address in use: the learner's override or the default. */
export function ollamaURL(): string {
  return useStore.getState().settings.baseURLs.ollama || PROVIDERS.find((p) => p.id === "ollama")!.baseURL;
}
