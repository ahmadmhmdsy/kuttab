// Runs an executor inside a Web Worker so a runaway loop can be killed: on
// timeout the worker is terminated and lazily recreated for the next run.
import type { Executor, RunOutput } from "./types.ts";

export interface WorkerRequest {
  id: number;
  code: string;
  setup?: string;
  after?: string;
}
export type WorkerResponse =
  | { id: number; started: true }
  | { id: number; output: RunOutput }
  | { id: number; fatal: string };

/** Loading a runtime (Pyodide is several MB) must not count against the learner's time limit. */
const INIT_BUDGET_MS = 120_000;

export function workerExecutor(makeWorker: () => Worker): { exec: Executor; dispose: () => void } {
  let worker: Worker | null = null;
  let seq = 0;
  const pending = new Map<number, (r: WorkerResponse) => void>();

  const ensure = (): Worker => {
    if (worker) return worker;
    const w = makeWorker();
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const cb = pending.get(ev.data.id);
      if (!cb) return;
      if (!("started" in ev.data)) pending.delete(ev.data.id);
      cb(ev.data);
    };
    w.onerror = (ev) => {
      for (const [id, resolve] of pending) resolve({ id, fatal: ev.message || "worker crashed" });
      pending.clear();
      w.terminate();
      if (worker === w) worker = null;
    };
    worker = w;
    return w;
  };

  // Runs are serialized: one worker, one program at a time.
  let chain: Promise<unknown> = Promise.resolve();

  const exec: Executor = (code, opts) => {
    const job = chain.then(
      () =>
        new Promise<RunOutput>((resolve) => {
          const id = ++seq;
          const w = ensure();
          const timeoutMs = opts.timeoutMs ?? 8000;
          const kill = (msg: string, ms: number) => () => {
            pending.delete(id);
            w.terminate();
            if (worker === w) worker = null;
            resolve({ ok: false, stdout: "", tables: [], error: msg, timedOut: true, ms });
          };
          let timer = setTimeout(kill("the runtime did not load in time", INIT_BUDGET_MS), INIT_BUDGET_MS);
          pending.set(id, (r) => {
            if ("started" in r) {
              clearTimeout(timer);
              timer = setTimeout(kill(`timed out after ${timeoutMs / 1000}s`, timeoutMs), timeoutMs);
              return;
            }
            clearTimeout(timer);
            resolve("output" in r ? r.output : { ok: false, stdout: "", tables: [], error: r.fatal, ms: 0 });
          });
          const req: WorkerRequest = { id, code, setup: opts.setup, after: opts.after };
          w.postMessage(req);
        }),
    );
    chain = job.catch(() => undefined);
    return job;
  };

  return {
    exec,
    dispose: () => {
      worker?.terminate();
      worker = null;
    },
  };
}
