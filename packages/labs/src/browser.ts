// Browser/Tauri wiring: each runtime executes in its own module worker.
import { LabRegistry } from "./registry.ts";
import { createRuntime } from "./runtime.ts";
import { workerExecutor } from "./worker-host.ts";

export function createBrowserLabs(): LabRegistry {
  const sql = workerExecutor(() => new Worker(new URL("./sql/worker.ts", import.meta.url), { type: "module" }));
  const python = workerExecutor(() => new Worker(new URL("./python/worker.ts", import.meta.url), { type: "module" }));
  return new LabRegistry()
    .register(createRuntime({ language: "sql", label: "SQL (SQLite)", editorMode: "sql", ...sql }))
    .register(createRuntime({ language: "python", label: "Python", editorMode: "python", ...python }));
}
