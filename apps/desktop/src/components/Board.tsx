// The live tutor's board: one renderer per board kind (see BOARD_FORMATS in the engine).

import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import type { BoardAction } from "@kuttab/engine";
import { useT } from "../i18n.ts";
import { Markdown } from "../markdown.tsx";
import { Widget } from "./Widgets.tsx";

const FRAME_MS = 2500;

export function BoardItem({ action }: { action: BoardAction }) {
  const t = useT();
  const { kind, title, content, source } = action;
  let body;
  if (kind === "diagram") body = <Widget part={{ name: "show_diagram", input: { title, mermaid: content } }} />;
  else if (kind === "math") body = <Widget part={{ name: "show_math", input: { latex: content, display: true } }} />;
  else if (kind === "chart") {
    const data = json(content);
    body = data ? <Widget part={{ name: "show_chart", input: { title, ...data } }} /> : <pre dir="auto">{content}</pre>;
  } else if (kind === "slide") body = <Slide title={title} content={content} />;
  else if (kind === "image") body = <BoardImage title={title} content={content} />;
  else if (kind === "animation") body = <Animation content={content} />;
  else if (kind === "lab") {
    const lab = json(content);
    body =
      lab && typeof lab.code === "string" ? (
        <Widget part={{ name: "run_code", input: { language: typeof lab.language === "string" ? lab.language : "python", code: lab.code } }} />
      ) : (
        <pre dir="ltr">{content}</pre>
      );
  } else body = <Markdown text={content} />;
  return (
    <div className="live-card" dir="auto">
      {body}
      {source && (
        <p className="live-src">
          {t("source")}: {source}
        </p>
      )}
    </div>
  );
}

function json(s: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function Slide({ title, content }: { title?: string; content: string }) {
  return (
    <section className="live-slide">
      {title && <h2>{title}</h2>}
      <Markdown text={content} />
    </section>
  );
}

/** A data: image or inline SVG. Web images are not fetched (the app stays offline), so their link is shown instead. */
function BoardImage({ title, content }: { title?: string; content: string }) {
  const t = useT();
  const src = content.trim();
  let url: string | null = null;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) url = src;
  else if (src.startsWith("<svg")) {
    const svg = DOMPurify.sanitize(src, { USE_PROFILES: { svg: true, svgFilters: true } });
    if (svg) url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  if (!url) return <p className="muted">{t("imageNotShown")}{/^https?:\/\//.test(src) && <> <code dir="ltr">{src}</code></>}</p>;
  return (
    <figure className="live-image">
      <img src={url} alt={title ?? ""} />
    </figure>
  );
}

/** Frames are markdown separated by lines holding only `---`; they step on their own unless motion is reduced. */
function Animation({ content }: { content: string }) {
  const t = useT();
  const frames = content.split(/^\s*---\s*$/m).map((f) => f.trim()).filter(Boolean);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(() => !matchMedia("(prefers-reduced-motion: reduce)").matches);
  const n = frames.length;
  useEffect(() => setI(0), [content]);
  useEffect(() => {
    if (!playing || n < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), FRAME_MS);
    return () => clearInterval(id);
  }, [playing, n]);
  if (!n) return null;
  const go = (d: number) => {
    setPlaying(false);
    setI((x) => (x + d + n) % n);
  };
  return (
    <section className="live-anim">
      <div className="live-anim-frame" key={i} aria-live="polite">
        <Markdown text={frames[Math.min(i, n - 1)]!} />
      </div>
      {n > 1 && (
        <div className="live-anim-bar">
          <button onClick={() => go(-1)}>{t("back")}</button>
          <button onClick={() => setPlaying((p) => !p)}>{playing ? t("pauseLive") : t("playAnim")}</button>
          <button onClick={() => go(1)}>{t("next")}</button>
          <span className="muted">
            {Math.min(i, n - 1) + 1} / {n}
          </span>
        </div>
      )}
    </section>
  );
}
