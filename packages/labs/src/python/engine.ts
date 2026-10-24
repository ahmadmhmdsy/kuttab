// In-process Python execution over Pyodide. Used in Node tests and inside the
// browser worker. Each run gets a fresh global namespace.
import type { PyodideAPI } from "pyodide";
import type { RunOptions, RunOutput } from "../types.ts";

/** Keeps only the learner-relevant tail of a Python traceback. */
export function trimTraceback(msg: string): string {
  const lines = msg.trim().split("\n");
  const start = lines.findIndex((l) => l.includes('File "<exec>"'));
  const tail = start >= 0 ? lines.slice(start) : lines.slice(-3);
  return tail.map((l) => l.replace('File "<exec>", ', "")).join("\n");
}

export async function runPython(py: PyodideAPI, code: string, opts: RunOptions & { after?: string } = {}): Promise<RunOutput> {
  const t0 = performance.now();
  let stdout = "";
  py.setStdout({ batched: (s: string) => (stdout += s + "\n") });
  py.setStderr({ batched: (s: string) => (stdout += s + "\n") });
  const ns = py.globals.get("dict")();
  try {
    if (opts.setup) await py.runPythonAsync(opts.setup, { globals: ns });
    await py.runPythonAsync(code, { globals: ns });
    if (opts.after) {
      try {
        await py.runPythonAsync(opts.after, { globals: ns });
      } catch (e) {
        const msg = trimTraceback((e as Error).message);
        const assertion = /AssertionError:?\s*(.*)$/s.exec(msg);
        return { ok: false, stdout, error: assertion ? `test failed: ${assertion[1] || "an assertion did not hold"}` : msg, tables: [], ms: performance.now() - t0 };
      }
    }
    return { ok: true, stdout, tables: [], ms: performance.now() - t0 };
  } catch (e) {
    return { ok: false, stdout, error: trimTraceback((e as Error).message), tables: [], ms: performance.now() - t0 };
  } finally {
    ns.destroy();
  }
}
