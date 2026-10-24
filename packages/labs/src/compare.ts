import type { ResultSet } from "./types.ts";

function norm(v: unknown): unknown {
  if (typeof v === "number") return Number.isInteger(v) ? v : Math.round(v * 1e6) / 1e6;
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Uint8Array) return `blob:${Array.from(v).join(",")}`;
  return v ?? null;
}

const key = (row: unknown[]) => JSON.stringify(row.map(norm));

export type CompareResult = { equal: true } | { equal: false; reason: string };

/** Compares result sets by values. Column names are ignored (aliases vary). */
export function compareResultSets(actual: ResultSet, expected: ResultSet, ordered: boolean): CompareResult {
  if (actual.columns.length !== expected.columns.length) {
    return { equal: false, reason: `expected ${expected.columns.length} column(s), got ${actual.columns.length}` };
  }
  if (actual.rows.length !== expected.rows.length) {
    return { equal: false, reason: `expected ${expected.rows.length} row(s), got ${actual.rows.length}` };
  }
  const a = actual.rows.map(key);
  const e = expected.rows.map(key);
  if (!ordered) {
    a.sort();
    e.sort();
  }
  for (let i = 0; i < e.length; i++) {
    if (a[i] !== e[i]) {
      return { equal: false, reason: ordered ? `row ${i + 1} differs (check ORDER BY and values)` : "the rows differ from the expected result" };
    }
  }
  return { equal: true };
}
