// Teacher-tool widgets (T-12). Inputs come from the model, so each widget
// treats them as untrusted: zod-checked in the engine, sanitized here, and
// every library is bundled (the CSP allows no CDN). Mermaid and KaTeX load on
// first use so the chat stays light.
import { useEffect, useId, useRef, useState } from "react";
import DOMPurify from "dompurify";
import type { RunOutput } from "@kuttab/labs";
import { useT } from "../i18n.ts";
import { services, useStore } from "../state.ts";
import { drawImage, errorText } from "../ai.ts";
import type { MadeImage } from "@kuttab/llm-gateway";
import { RunOutputView, Spinner } from "./common.tsx";

export interface WidgetPart {
  name: string;
  input: unknown;
}

export function Widget({ part, onAnswer }: { part: WidgetPart; onAnswer?: (text: string) => void }) {
  const i = part.input as never;
  switch (part.name) {
    case "show_chart":
      return <ChartWidget {...(i as ChartInput)} />;
    case "show_diagram":
      return <DiagramWidget {...(i as { title: string; mermaid: string })} />;
    case "show_math":
      return <MathWidget {...(i as { latex: string; display?: boolean })} />;
    case "quiz_card":
      return <QuizWidget {...(i as QuizInput)} onAnswer={onAnswer} />;
    case "run_code":
      return <CodeWidget {...(i as { language: string; code: string })} />;
    case "make_image":
      return <ImageWidget {...(i as { prompt: string; caption: string })} />;
    default:
      return null;
  }
}

interface ChartInput {
  title: string;
  kind: "bar" | "line";
  labels: string[];
  series: { name: string; values: number[] }[];
}

const SERIES_COLORS = ["var(--primary)", "var(--warn)", "var(--bad)", "var(--muted)"];

// A small SVG chart: enough for a lesson, no charting library to ship.
function ChartWidget({ title, kind, labels, series }: ChartInput) {
  const W = 360;
  const H = 200;
  const pad = { l: 36, r: 8, t: 8, b: 34 };
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const x0 = pad.l;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const y = (v: number) => pad.t + ih - ((v - min) / span) * ih;
  const slot = iw / labels.length;
  const bw = (slot * 0.8) / series.length;
  const ticks = [min, min + span / 2, max];
  return (
    <figure className="widget chart">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={x0} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={x0 - 4} y={y(v) + 4} textAnchor="end" className="tick">
              {+v.toFixed(2)}
            </text>
          </g>
        ))}
        {labels.map((l, i) => (
          <text key={i} x={x0 + slot * (i + 0.5)} y={H - pad.b + 14} textAnchor="middle" className="tick">
            {l.length > 10 ? `${l.slice(0, 9)}…` : l}
          </text>
        ))}
        {series.map((s, si) =>
          kind === "bar" ? (
            s.values.slice(0, labels.length).map((v, i) => (
              <rect key={`${si}-${i}`} x={x0 + slot * i + slot * 0.1 + bw * si} y={Math.min(y(v), y(0))} width={bw} height={Math.abs(y(v) - y(0))} fill={SERIES_COLORS[si % 4]}>
                <title>{`${s.name} · ${labels[i]}: ${v}`}</title>
              </rect>
            ))
          ) : (
            <polyline
              key={si}
              fill="none"
              stroke={SERIES_COLORS[si % 4]}
              strokeWidth={2}
              points={s.values
                .slice(0, labels.length)
                .map((v, i) => `${x0 + slot * (i + 0.5)},${y(v)}`)
                .join(" ")}
            />
          ),
        )}
      </svg>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s, si) => (
            <span key={si}>
              <i style={{ background: SERIES_COLORS[si % 4] }} /> {s.name}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}

let mermaidReady: Promise<typeof import("mermaid").default> | undefined;
function loadMermaid(dark: boolean) {
  mermaidReady ??= import("mermaid").then((m) => m.default);
  return mermaidReady.then((m) => {
    // SVG text labels, not HTML in <foreignObject>: DOMPurify empties those, and plain SVG is the smaller surface.
    m.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default", fontFamily: "inherit", htmlLabels: false, flowchart: { htmlLabels: false } });
    return m;
  });
}

function isDark(): boolean {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

function DiagramWidget({ title, mermaid }: { title: string; mermaid: string }) {
  const t = useT();
  const id = `m${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string>();
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    let live = true;
    void loadMermaid(isDark())
      .then((m) => m.render(id, mermaid))
      .then(({ svg }) => {
        if (!live || !ref.current) return;
        // Mermaid's strict mode already escapes labels; DOMPurify is the second lock.
        ref.current.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
      })
      .catch((e) => live && setErr(errorText(e)));
    return () => {
      live = false;
    };
  }, [id, mermaid, theme]);
  return (
    <figure className="widget diagram">
      <figcaption>{title}</figcaption>
      {err ? (
        <details>
          <summary className="muted">{t("widgetFailed")}</summary>
          <pre dir="ltr">{mermaid}</pre>
        </details>
      ) : (
        <div ref={ref} className="diagram-svg" dir="ltr">
          <Spinner />
        </div>
      )}
    </figure>
  );
}

let katexReady: Promise<typeof import("katex").default> | undefined;

function MathWidget({ latex, display = true }: { latex: string; display?: boolean }) {
  const [html, setHtml] = useState<string>();
  useEffect(() => {
    katexReady ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([k]) => k.default);
    let live = true;
    void katexReady.then((k) => live && setHtml(k.renderToString(latex, { displayMode: display, throwOnError: false, trust: false, strict: "ignore" })));
    return () => {
      live = false;
    };
  }, [latex, display]);
  return (
    <div className="widget math" dir="ltr">
      {html ? <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} /> : <code>{latex}</code>}
    </div>
  );
}

interface QuizInput {
  question: string;
  choices: string[];
  answer: number;
  explanation: string;
}

function QuizWidget({ question, choices, answer, explanation, onAnswer }: QuizInput & { onAnswer?: (text: string) => void }) {
  const t = useT();
  const [picked, setPicked] = useState<number>();
  return (
    <div className="widget quiz">
      <p>
        <strong>{question}</strong>
      </p>
      <div className="choices">
        {choices.map((c, i) => (
          <button
            key={i}
            disabled={picked !== undefined}
            className={picked === undefined ? "" : i === answer ? "right" : i === picked ? "wrong" : ""}
            onClick={() => {
              setPicked(i);
              onAnswer?.(`${t("quizMyAnswer")}: ${c} (${i === answer ? t("correct") : t("notQuite")})`);
            }}
          >
            {c}
          </button>
        ))}
      </div>
      {picked !== undefined && <p className="muted">{explanation}</p>}
    </div>
  );
}

/** Drawn pictures are kept with the learner's data, so reopening a lesson does not pay to draw again. */
function imageKey(prompt: string): string {
  const m = useStore.getState().settings.image;
  let h = 0;
  for (const c of `${m?.provider}:${m?.model}:${prompt}`) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return `images/${(h >>> 0).toString(36)}`;
}

function ImageWidget({ prompt, caption }: { prompt: string; caption: string }) {
  const t = useT();
  const [img, setImg] = useState<MadeImage>();
  const [err, setErr] = useState<string>();
  useEffect(() => {
    let live = true;
    void (async () => {
      const { store } = services().platform;
      const key = imageKey(prompt);
      try {
        const made = (await store.get<MadeImage>(key)) ?? (await drawImage(prompt));
        await store.set(key, made);
        if (live) setImg(made);
      } catch (e) {
        if (live) setErr(errorText(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [prompt]);
  if (err) return <div className="error">{t("imageFailed")}: {err}</div>;
  if (!img) return <div className="widget row"><Spinner /> {t("imageDrawing")}</div>;
  return (
    <figure className="widget made-image">
      <img src={img.dataUri} alt={caption} />
      <figcaption>
        {caption}
        <small className="muted">{img.source} · {t("imageNotice")}</small>
      </figcaption>
    </figure>
  );
}

function CodeWidget({ language, code }: { language: string; code: string }) {
  const t = useT();
  const ask = useStore((s) => s.settings.askBeforeCode);
  const [out, setOut] = useState<RunOutput>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const run = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      setOut(await services().labs.get(language).run(code, {}));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!ask) void run();
    // Run once on mount when the learner allowed it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="widget code">
      <pre dir="ltr">
        <code>{code}</code>
      </pre>
      <div className="row">
        <button onClick={run} disabled={busy}>
          ▶ {t("run")} · {language}
        </button>
        {busy && <Spinner />}
      </div>
      {err && <div className="error">{err}</div>}
      {out && <RunOutputView out={out} />}
    </div>
  );
}
