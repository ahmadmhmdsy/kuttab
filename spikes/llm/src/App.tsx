import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULTS, PROVIDERS, runProvider, type CheckResult, type ProviderId } from "./gateway";
import { makeTauriFetch } from "./platform/tauri-fetch";
import "./App.css";

type Form = Record<ProviderId, { model: string; apiKey: string }>;

const initialForm = Object.fromEntries(
  PROVIDERS.map((p) => [p, { model: DEFAULTS[p].model, apiKey: "" }]),
) as Form;

const line = (r: CheckResult, stripOrigin: boolean) =>
  `${r.provider.padEnd(9)} ${r.check.padEnd(9)} ${r.status.padEnd(7)} origin=${stripOrigin ? "stripped" : "app"} ${r.ms}ms ${r.detail}`;

export default function App() {
  // Keys live only in this component's memory: never localStorage, never Rust.
  const [form, setForm] = useState<Form>(initialForm);
  const [stripOrigin, setStripOrigin] = useState(true);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function run(providers: ProviderId[], strip: boolean, f: Form) {
    const fetch = makeTauriFetch({ stripOrigin: strip });
    for (const provider of providers) {
      setLive("");
      const cfg = { provider, model: f[provider].model, apiKey: f[provider].apiKey || undefined };
      const rs = await runProvider(cfg, fetch, (t) => setLive((s) => s + t));
      setResults((prev) => [...prev, ...rs]);
      for (const r of rs) await invoke("report", { line: line(r, strip) });
    }
  }

  async function onRun(providers: ProviderId[]) {
    setBusy(true);
    setResults([]);
    try {
      await run(providers, stripOrigin, form);
    } finally {
      setBusy(false);
    }
  }

  // Keyless autorun (KUTTAB_SPIKE_AUTORUN=1): both Origin modes, then exit.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      if (!(await invoke<boolean>("autorun_requested"))) return;
      await invoke("report", { line: `autorun start origin=${window.location.origin}` });
      for (const strip of [false, true]) await run(PROVIDERS, strip, initialForm);
      await invoke("report", { line: "autorun done" });
      await invoke("quit");
    })();
  }, []);

  const set = (p: ProviderId, k: "model" | "apiKey", v: string) =>
    setForm((f) => ({ ...f, [p]: { ...f[p], [k]: v } }));

  return (
    <main className="container">
      <h1>Kuttab spike T-3: LLM gateway</h1>
      <p>Keys stay in memory for this window only. Empty key = model calls skipped; transport is still probed with an invalid key.</p>
      <table>
        <thead>
          <tr><th>provider</th><th>model</th><th>API key</th><th /></tr>
        </thead>
        <tbody>
          {PROVIDERS.map((p) => (
            <tr key={p}>
              <td>{p}</td>
              <td><input value={form[p].model} onChange={(e) => set(p, "model", e.target.value)} /></td>
              <td>
                {DEFAULTS[p].needsKey ? (
                  <input type="password" autoComplete="off" value={form[p].apiKey} onChange={(e) => set(p, "apiKey", e.target.value)} />
                ) : (
                  "none (localhost:11434)"
                )}
              </td>
              <td><button disabled={busy} onClick={() => onRun([p])}>Run</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <label>
          <input type="checkbox" checked={stripOrigin} onChange={(e) => setStripOrigin(e.target.checked)} /> strip Origin header
        </label>{" "}
        <button disabled={busy} onClick={() => onRun(PROVIDERS)}>Run all</button>
      </p>
      <h2>Live stream</h2>
      <pre className="live">{live || "(nothing yet)"}</pre>
      <h2>Results</h2>
      <table>
        <thead>
          <tr><th>provider</th><th>check</th><th>status</th><th>ms</th><th>detail</th></tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i} className={r.status.toLowerCase()}>
              <td>{r.provider}</td><td>{r.check}</td><td>{r.status}</td><td>{r.ms}</td><td><code>{r.detail}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
