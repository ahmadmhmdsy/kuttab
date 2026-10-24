// Tauri host. HTTP goes through Rust (no CORS), keys through the OS keychain,
// data through SQLite. Key values cross the IPC bridge only to be stored or used.
import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { KvStore } from "@kuttab/engine";
import type { FetchFn } from "@kuttab/llm-gateway";
import type { Platform } from "./types.ts";

/** Strips the WebView Origin header so local servers and cloud APIs see a server-side call (spike T-3). */
const fetchNoOrigin: FetchFn = ((input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set("Origin", "");
  return tauriFetch(input, { ...init, headers });
}) as FetchFn;

const store: KvStore = {
  async get<T>(key: string) {
    const v = await invoke<string | null>("kv_get", { key });
    return v == null ? undefined : (JSON.parse(v) as T);
  },
  async set(key, value) {
    await invoke("kv_set", { key, value: JSON.stringify(value) });
  },
  async delete(key) {
    await invoke("kv_delete", { key });
  },
  keys(prefix = "") {
    return invoke<string[]>("kv_keys", { prefix });
  },
};

export function tauriPlatform(): Platform {
  return {
    kind: "tauri",
    fetch: fetchNoOrigin,
    store,
    secrets: {
      persistent: true,
      async get(id) {
        return (await invoke<string | null>("secret_get", { id })) ?? undefined;
      },
      async set(id, value) {
        await invoke("secret_set", { id, value });
      },
      async delete(id) {
        await invoke("secret_delete", { id });
      },
    },
    saveFile(name, contents) {
      return invoke<boolean>("export_file", { name, contents });
    },
    openUrl: (url) => openUrl(url),
  };
}
