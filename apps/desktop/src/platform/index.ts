import { browserPlatform } from "./browser.ts";
import type { Platform } from "./types.ts";

export type { Platform, Secrets } from "./types.ts";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function createPlatform(): Promise<Platform> {
  if (isTauri) return (await import("./tauri.ts")).tauriPlatform();
  return browserPlatform();
}
