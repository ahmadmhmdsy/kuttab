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

/** What a page in the search window looked like when read. */
export interface PageCapture {
  url: string;
  title: string;
  text: string;
  links: { text: string; href: string }[];
}

/** The visible search window (desktop only, decision 0002 item 8). It has no IPC; the host reads pages for us. */
export interface WebWindow {
  /** Shows the window at `url` and resolves once the page has loaded (or after a timeout). */
  /** `visible: false` loads the page in the hidden (headless) window. */
  open(url: string, visible?: boolean): Promise<void>;
  show(): Promise<void>;
  /** Reads the page now shown; `selector` limits which links are kept. */
  capture(selector?: string): Promise<PageCapture>;
  close(): Promise<void>;
}

export interface Platform {
  kind: "tauri" | "browser";
  fetch: FetchFn;
  store: KvStore;
  secrets: Secrets;
  /** Asks the user where to save, then writes the file. Returns false if cancelled. */
  saveFile(name: string, contents: string): Promise<boolean>;
  openUrl(url: string): Promise<void>;
  /** Absent in a plain browser. */
  web?: WebWindow;
  /** Memory, CPUs and free disk (desktop only; a browser can only guess). */
  hardware?(): Promise<{ ramGb: number; cpus: number; diskFreeGb?: number }>;
}
