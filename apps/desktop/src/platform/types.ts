// What the UI needs from the host. Two implementations: the Tauri shell
// (Rust HTTP, OS keychain, SQLite) and a plain browser (dev and preview).
import type { KvStore } from "@kuttab/engine";
import type { FetchFn } from "@kuttab/llm-gateway";

export interface Secrets {
  /** True when secrets survive a restart (OS keychain). */
  readonly persistent: boolean;
  get(id: string): Promise<string | undefined>;
  set(id: string, value: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface Platform {
  kind: "tauri" | "browser";
  fetch: FetchFn;
  store: KvStore;
  secrets: Secrets;
  /** Asks the user where to save, then writes the file. Returns false if cancelled. */
  saveFile(name: string, contents: string): Promise<boolean>;
  openUrl(url: string): Promise<void>;
}
