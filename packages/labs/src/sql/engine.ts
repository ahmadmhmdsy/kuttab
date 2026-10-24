// In-process SQL execution over sql.js. Used directly in Node tests and inside
// the browser worker. Each run gets a fresh in-memory database.
import type { SqlJsStatic } from "sql.js";
import type { ResultSet, RunOptions, RunOutput } from "../types.ts";

export function runSql(SQL: SqlJsStatic, code: string, opts: RunOptions & { after?: string } = {}): RunOutput {
  const t0 = performance.now();
  const db = new SQL.Database();
  const tables: ResultSet[] = [];
  try {
    if (opts.setup) db.exec(opts.setup);
  } catch (e) {
    db.close();
    throw new Error(`Exercise setup failed: ${(e as Error).message}`);
  }
  try {
    for (const r of db.exec(code)) tables.push({ columns: r.columns, rows: r.values });
    if (opts.after) for (const r of db.exec(opts.after)) tables.push({ columns: r.columns, rows: r.values });
    return { ok: true, stdout: "", tables, ms: performance.now() - t0 };
  } catch (e) {
    return { ok: false, stdout: "", error: (e as Error).message, tables, ms: performance.now() - t0 };
  } finally {
    db.close();
  }
}
