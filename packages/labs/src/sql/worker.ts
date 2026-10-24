/// <reference lib="webworker" />
import initSqlJs, { type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { runSql } from "./engine.ts";
import type { WorkerRequest, WorkerResponse } from "../worker-host.ts";

let SQL: Promise<SqlJsStatic> | null = null;
const post = (r: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(r);

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const { id, code, setup, after } = ev.data;
  try {
    SQL ??= initSqlJs({ locateFile: () => wasmUrl });
    const sql = await SQL;
    post({ id, started: true });
    post({ id, output: runSql(sql, code, { setup, after }) });
  } catch (e) {
    post({ id, fatal: (e as Error).message });
  }
};
