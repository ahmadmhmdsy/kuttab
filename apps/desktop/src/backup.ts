// Backup export and import (T-13). A backup is every key of the platform store
// as one JSON file. API keys live in the keychain, never in the store, so a
// backup carries none, and an import refuses anything shaped like a secret.
import type { KvStore } from "@kuttab/engine";

export interface Backup {
  app: "kuttab";
  exportedAt: string;
  data: Record<string, unknown>;
}

/** Larger files are not a Kuttab backup; reading them would only stall the app. */
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

export class BackupError extends Error {
  constructor(readonly code: "too-big" | "not-json" | "not-kuttab" | "has-secret") {
    super(code);
  }
}

export async function makeBackup(store: KvStore, now = new Date()): Promise<string> {
  const data: Record<string, unknown> = {};
  for (const k of await store.keys()) data[k] = await store.get(k);
  const b: Backup = { app: "kuttab", exportedAt: now.toISOString(), data };
  return JSON.stringify(b, null, 2);
}

export function parseBackup(text: string): Backup {
  if (text.length > MAX_BACKUP_BYTES) throw new BackupError("too-big");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("not-json");
  }
  const b = raw as Partial<Backup> | null;
  if (!b || b.app !== "kuttab" || typeof b.data !== "object" || b.data === null || Array.isArray(b.data)) throw new BackupError("not-kuttab");
  if (Object.keys(b.data).some((k) => k.startsWith("key:"))) throw new BackupError("has-secret");
  return { app: "kuttab", exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : "", data: b.data };
}

/** Replaces the whole store with the backup. Keychain secrets are left alone. */
export async function restoreBackup(store: KvStore, b: Backup): Promise<number> {
  for (const k of await store.keys()) await store.delete(k);
  const entries = Object.entries(b.data);
  for (const [k, v] of entries) await store.set(k, v);
  return entries.length;
}
