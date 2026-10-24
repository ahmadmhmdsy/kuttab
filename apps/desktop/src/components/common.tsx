import { useState, type ReactNode } from "react";
import type { RunOutput } from "@kuttab/labs";
import type { Lang } from "@kuttab/engine";
import { useT } from "../i18n.ts";
import { useStore } from "../state.ts";
import { errorText } from "../ai.ts";
import { canSpeak, speak, startRecording, stopSpeaking, transcribe, whisperCached, WHISPER_SIZE_MB, type Recorder } from "../speech.ts";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="dot" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  const go = useStore((s) => s.go);
  const msg = errorText(error);
  return (
    <div className="error" role="alert">
      <strong>{t("error")}</strong>
      <p>{msg === "no-model" ? t("needsModel") : msg === "budget-spent" ? t("budgetNone") : msg}</p>
      <div className="row">
        {msg === "no-model" && <button onClick={() => go({ name: "settings" })}>{t("settings")}</button>}
        {onRetry && <button onClick={onRetry}>{t("retry")}</button>}
      </div>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className ?? ""}`}>{children}</section>;
}

export function RunOutputView({ out }: { out: RunOutput }) {
  const t = useT();
  return (
    <div className="run-output" dir="ltr">
      {out.error && <pre className="err">{out.error}</pre>}
      {out.stdout && <pre>{out.stdout}</pre>}
      {out.tables.map((tb, i) => (
        <div className="table-wrap" key={i}>
          <table>
            <thead>
              <tr>
                {tb.columns.map((c, j) => (
                  <th key={j}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tb.rows.slice(0, 200).map((r, j) => (
                <tr key={j}>
                  {r.map((v, k) => (
                    <td key={k}>{v === null ? <em>NULL</em> : String(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <small>
            {tb.rows.length} {t("rows")}
          </small>
        </div>
      ))}
      {!out.error && !out.stdout && !out.tables.length && <pre className="muted">{t("noOutput")}</pre>}
      <small className="muted">{Math.round(out.ms)} ms</small>
    </div>
  );
}

export function SpeakButton({ text, lang }: { text: string; lang: Lang }) {
  const t = useT();
  const tts = useStore((s) => s.settings.tts);
  const [on, setOn] = useState(false);
  if (!tts || !canSpeak()) return null;
  return (
    <button
      className="icon"
      title={on ? t("stopSpeaking") : t("speak")}
      aria-label={on ? t("stopSpeaking") : t("speak")}
      onClick={() => {
        if (on) {
          stopSpeaking();
          setOn(false);
        } else {
          setOn(true);
          speak(text, lang, () => setOn(false));
        }
      }}
    >
      {on ? "■" : "🔊"}
    </button>
  );
}

/** Records speech and appends the local Whisper transcript. */
export function MicButton({ lang, onText }: { lang: Lang; onText: (s: string) => void }) {
  const t = useT();
  const size = useStore((s) => s.settings.whisper);
  const [rec, setRec] = useState<Recorder | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) return null;
  const toggle = async () => {
    setErr(undefined);
    if (rec) {
      setRec(null);
      setBusy(true);
      try {
        const text = await transcribe(await rec.stop(), size, lang);
        if (text) onText(text);
      } catch (e) {
        setErr(errorText(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!whisperCached(size) && !confirm(t("whisperConfirm", { size: `${WHISPER_SIZE_MB[size]} MB` }))) return;
    try {
      setRec(await startRecording());
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <span className="mic">
      <button className={`icon ${rec ? "recording" : ""}`} disabled={busy} onClick={toggle} title={rec ? t("micStop") : t("mic")} aria-label={rec ? t("micStop") : t("mic")}>
        {busy ? "…" : rec ? "■" : "🎤"}
      </button>
      {busy && <small>{t("transcribing")}</small>}
      {err && <small className="err">{err}</small>}
    </span>
  );
}
