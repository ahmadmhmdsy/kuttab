// Browser host: IndexedDB for data, memory-only secrets, anchor downloads.
import type { KvStore } from "@kuttab/engine";
import type { Platform, Secrets } from "./types.ts";

class IdbStore implements KvStore {
  private db: Promise<IDBDatabase>;
  constructor(name = "kuttab") {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const r = fn(db.transaction("kv", mode).objectStore("kv"));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async get<T>(key: string): Promise<T | undefined> {
    const v = await this.tx<string | undefined>("readonly", (s) => s.get(key) as IDBRequest<string | undefined>);
    return v === undefined ? undefined : (JSON.parse(v) as T);
  }
  async set<T>(key: string, value: T): Promise<void> {
    await this.tx("readwrite", (s) => s.put(JSON.stringify(value), key));
  }
  async delete(key: string): Promise<void> {
    await this.tx("readwrite", (s) => s.delete(key));
  }
  async keys(prefix = ""): Promise<string[]> {
    const all = await this.tx("readonly", (s) => s.getAllKeys());
    return (all as string[]).filter((k) => k.startsWith(prefix)).sort();
  }
}

/** A browser has no keychain, so keys live in memory for this tab only. */
class MemorySecrets implements Secrets {
  readonly persistent = false;
  private m = new Map<string, string>();
  async get(id: string) {
    return this.m.get(id);
  }
  async set(id: string, v: string) {
    this.m.set(id, v);
  }
  async delete(id: string) {
    this.m.delete(id);
  }
}

export function browserPlatform(): Platform {
  return {
    kind: "browser",
    fetch: globalThis.fetch.bind(globalThis),
    store: new IdbStore(),
    secrets: new MemorySecrets(),
    async saveFile(name, contents) {
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    },
    async openUrl(url) {
      window.open(url, "_blank", "noopener,noreferrer");
    },
  };
}
