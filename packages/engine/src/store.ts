// Storage contract. The app provides SQLite (Tauri) or IndexedDB/localStorage
// (browser) implementations; tests use the memory store. Values are JSON.

export interface KvStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

export class MemoryStore implements KvStore {
  private m = new Map<string, string>();
  async get<T>(key: string): Promise<T | undefined> {
    const v = this.m.get(key);
    return v === undefined ? undefined : (JSON.parse(v) as T);
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.m.set(key, JSON.stringify(value));
  }
  async delete(key: string): Promise<void> {
    this.m.delete(key);
  }
  async keys(prefix = ""): Promise<string[]> {
    return [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}

/** Key layout, kept in one place so stores and migrations agree. */
export const K = {
  profile: "profile",
  memory: "memory",
  settings: "settings",
  streak: "streak",
  plans: "plans/",
  plan: (id: string) => `plans/${id}`,
  mastery: (planId: string) => `mastery/${planId}`,
  lesson: (planId: string, objectiveId: string) => `lessons/${planId}/${objectiveId}`,
  live: (planId: string, objectiveId: string) => `live/${planId}/${objectiveId}`,
  cards: "cards/",
  card: (id: string) => `cards/${id}`,
  kb: "kb",
  usage: "usage",
} as const;

/** Short stable hash (FNV-1a) for cache keys. Not for security. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
