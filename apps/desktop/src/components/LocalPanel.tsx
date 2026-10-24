// Settings → Local (T-26, decision 0002 items 6, 7 and 16): check the machine
// and get advice before any download, see which local servers are running,
// link a Hugging Face model through Ollama, and pick the model a live session
// falls back to. Nothing downloads without the learner's OK.
import { useEffect, useState } from "react";
import { detectLocalServers, hfGgufFiles, hfToOllama, ollamaModels, pullOllama, recommendLocal, type GgufFile, type LocalPlan, type LocalServer } from "@kuttab/llm-gateway";
import { useT } from "../i18n.ts";
import { services, useStore, type Settings } from "../state.ts";
import { errorText } from "../ai.ts";
import { checkHardware, ollamaURL } from "../local.ts";
import { Card } from "./common.tsx";
import { ModelPicker } from "./ModelPicker.tsx";

export function LocalPanel() {
  const t = useT();
  const { settings, updateSettings } = useStore();
  const [hw, setHw] = useState<Awaited<ReturnType<typeof checkHardware>>>();
  const [plan, setPlan] = useState<LocalPlan>();
  const [servers, setServers] = useState<LocalServer[]>();
  const [installed, setInstalled] = useState<{ name: string; gb: number }[]>();
  const [link, setLink] = useState("");
  const [files, setFiles] = useState<GgufFile[]>();
  const [progress, setProgress] = useState<string>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  const run = async (f: () => Promise<void>) => {
    setErr(undefined);
    setBusy(true);
    try {
      await f();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    const { fetch } = services().platform;
    const found = await detectLocalServers(fetch);
    setServers(found);
    setInstalled(found.some((s) => s.provider === "ollama") ? await ollamaModels(ollamaURL(), fetch).catch(() => undefined) : undefined);
  };

  useEffect(() => {
    void scan().catch(() => setServers([]));
  }, []);

  const check = () =>
    run(async () => {
      const h = await checkHardware();
      setHw(h);
      setPlan(recommendLocal(h));
    });

  const useLocal = (model: string) => updateSettings({ local: { provider: "ollama", model } });

  const pull = (name: string, gb?: number) =>
    run(async () => {
      if (!confirm(t("pullConfirm", { name, size: gb ? String(gb) : "?" }))) return;
      await pullOllama(ollamaURL(), name, services().platform.fetch, (p) => setProgress(p.fraction !== undefined ? `${p.status} ${Math.round(p.fraction * 100)}%` : p.status));
      setProgress(t("pullDone", { name }));
      useLocal(name);
      await scan();
    });

  const name = hfToOllama(link);
  const hasOllama = servers?.some((s) => s.provider === "ollama");

  return (
    <>
      <Card>
        <h2>{t("hardware")}</h2>
        <button onClick={check} disabled={busy}>
          {t("checkHardware")}
        </button>
        {hw && (
          <p>
            {t("hardwareSummary", { ram: String(hw.ramGb), cpus: String(hw.cpus ?? "?"), disk: hw.diskFreeGb !== undefined ? String(hw.diskFreeGb) : "?" })}
            {hw.gpuName ? ` · ${hw.gpuName}` : hw.gpu ? " · WebGPU" : ""}
          </p>
        )}
        {plan && (
          <div className="local-plan">
            <p>
              {plan.teacher ? t("localSuggest", { model: plan.teacher.label, size: String(plan.teacher.gb ?? "?") }) : t("localNone")}
              {plan.alternatives.length > 0 && ` ${t("localAlso")} ${plan.alternatives.map((m) => m.label).join(", ")}.`}
            </p>
            <p className="muted">
              {t("localDownload", { size: String(plan.downloadGb), whisper: plan.whisper })}
              {!plan.fitsDisk && ` ${t("localNoDisk")}`}
            </p>
            {plan.lowCompute && <p className="muted">{t("localLowHint")}</p>}
            {plan.teacher && hasOllama && !installed?.some((m) => m.name.startsWith(plan.teacher!.model)) && (
              <button onClick={() => pull(plan.teacher!.model, plan.teacher!.gb)} disabled={busy}>
                {t("pullModel", { name: plan.teacher.model })}
              </button>
            )}
          </div>
        )}
      </Card>
      <Card>
        <h2>{t("localServers")}</h2>
        {servers === undefined ? (
          <p className="muted">…</p>
        ) : servers.length === 0 ? (
          <p className="muted">{t("noLocalServers")}</p>
        ) : (
          <ul>
            {servers.map((s) => (
              <li key={s.provider} dir="ltr">
                {s.provider} — {s.baseURL} ({s.models.length})
              </li>
            ))}
          </ul>
        )}
        {installed && installed.length > 0 && (
          <ul>
            {installed.map((m) => (
              <li key={m.name}>
                <span dir="ltr">{m.name}</span> · {m.gb} GB{" "}
                <button className="link" onClick={() => useLocal(m.name)}>
                  {t("useAsLocal")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button onClick={() => run(scan)} disabled={busy}>
          {t("rescan")}
        </button>
      </Card>
      <Card>
        <h2>{t("hfLink")}</h2>
        <p className="muted">{t("hfLead")}</p>
        <input dir="ltr" value={link} placeholder="hf.co/user/model-GGUF" onChange={(e) => (setLink(e.target.value), setFiles(undefined))} />
        <button disabled={!name || busy} onClick={() => run(async () => setFiles(await hfGgufFiles(name!, services().platform.fetch)))}>
          {t("hfSizes")}
        </button>
        {files && files.length === 0 && <p className="muted">{t("hfNoGguf")}</p>}
        {files?.map((f) => (
          <div key={f.file} className="row">
            <span dir="ltr">{f.quant ?? f.file}</span> · {f.gb} GB
            {hw && f.gb * 2 > hw.ramGb && <span className="muted"> · {t("tooBig")}</span>}
            <button disabled={!hasOllama || busy} onClick={() => pull(`${name!.replace(/:.*$/, "")}${f.quant ? `:${f.quant}` : ""}`, f.gb)}>
              {t("pull")}
            </button>
          </div>
        ))}
        {!hasOllama && <p className="muted">{t("needsOllama")}</p>}
        {progress && <p dir="ltr">{progress}</p>}
        {err && <p className="error">{err}</p>}
      </Card>
      <Card>
        <h2>{t("localFallback")}</h2>
        <p className="muted">{t("localFallbackLead")}</p>
        <ModelPicker role="teacher" value={settings.local} onChange={(v) => updateSettings({ local: v })} emptyLabel={t("none")} />
        <h3>{t("liveModeTitle")}</h3>
        <div className="choice-row" role="radiogroup">
          {(
            [
              ["live", t("liveModeLive")],
              ["low", t("liveModeLow")],
            ] as [Settings["liveMode"], string][]
          ).map(([v, label]) => (
            <label key={v} className="inline">
              <input type="radio" name="liveMode" checked={settings.liveMode === v} onChange={() => updateSettings({ liveMode: v })} />
              {label}
            </label>
          ))}
        </div>
      </Card>
    </>
  );
}
