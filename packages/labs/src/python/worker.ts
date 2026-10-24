/// <reference lib="webworker" />
import { loadPyodide, type PyodideAPI } from "pyodide";
import { runPython } from "./engine.ts";
import type { WorkerRequest, WorkerResponse } from "../worker-host.ts";

// Pyodide's files are served by the app itself at /pyodide/ (copied at build
// time), so Python works offline and nothing is fetched from a CDN.
const indexURL = new URL("/pyodide/", self.location.href).href;
let py: Promise<PyodideAPI> | null = null;
const post = (r: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(r);

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const { id, code, setup, after } = ev.data;
  try {
    py ??= loadPyodide({ indexURL });
    const api = await py;
    post({ id, started: true });
    post({ id, output: await runPython(api, code, { setup, after }) });
  } catch (e) {
    post({ id, fatal: (e as Error).message });
  }
};
