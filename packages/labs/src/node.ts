// In-process wiring for Node (tests, CI pack checks). No timeouts: only trusted
// reference and known-wrong solutions run here.
import initSqlJs from "sql.js";
import { loadPyodide, type PyodideAPI } from "pyodide";
import { LabRegistry } from "./registry.ts";
import { createRuntime } from "./runtime.ts";
import { runSql } from "./sql/engine.ts";
import { runPython } from "./python/engine.ts";

export function createNodeLabs(): LabRegistry {
  const SQL = initSqlJs();
  let py: Promise<PyodideAPI> | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  return new LabRegistry()
    .register(createRuntime({ language: "sql", label: "SQL (SQLite)", editorMode: "sql", exec: async (code, o) => runSql(await SQL, code, o) }))
    .register(
      createRuntime({
        language: "python",
        label: "Python",
        editorMode: "python",
        // Pyodide has one interpreter: serialize runs so stdout capture never interleaves.
        exec: (code, o) => {
          const job = chain.then(async () => runPython(await (py ??= loadPyodide()), code, o));
          chain = job.catch(() => undefined);
          return job;
        },
      }),
    );
}
