// The learner's own sources: pasted text, files, web pages, images, recordings
// and videos. Lessons and grounded answers cite them; nothing here leaves the
// machine except the passages (and images) sent to the chosen model. Audio and
// video are transcribed by the local Whisper model; an online video gives its
// published transcript and is never downloaded.
import { useState } from "react";
import { askGrounded, readImage, type GroundedAnswer, type Lang } from "@kuttab/engine";
import {
  extractDocx,
  extractHtml,
  extractImage,
  extractMarkdown,
  extractPdf,
  extractPlain,
  extractTranscript,
  fetchYoutubeTranscript,
  parseSubtitles,
  youtubeId,
  type Section,
  type Source,
  type SourceKind,
} from "@kuttab/kb";
import { useT } from "../i18n.ts";
import { saveKb, services, useStore } from "../state.ts";
import { embedFn, embedderKey, kbEmbed, makeCtx } from "../ai.ts";
import { Card, ErrorBox, MicButton, Spinner } from "../components/common.tsx";
import { WHISPER_SIZE_MB, transcribeTimed, whisperCached } from "../speech.ts";
import { Markdown } from "../markdown.tsx";

async function addSource(title: string, kind: SourceKind, sections: Section[], origin?: string): Promise<void> {
  const s = services();
  if (!sections.some((x) => x.text.trim())) throw new Error("No text found in this source.");
  const first = s.kb.size === 0;
  // A fresh knowledge base adopts the current embedder; otherwise only a
  // matching embedder adds vectors.
  const embed = first ? await embedFn() : await kbEmbed();
  const source: Source = { id: `src:${Date.now().toString(36)}`, title: title.trim() || "Untitled", kind, origin, addedAt: new Date().toISOString() };
  await s.kb.add(source, sections, embed);
  await saveKb(first ? (embed ? embedderKey() : "") : undefined);
}

const IMAGE = /.(png|jpe?g|webp|gif)$/;
const AUDIO = /.(mp3|wav|m4a|ogg|oga|flac|aac|opus)$/;
const VIDEO = /.(mp4|webm|mov|mkv|m4v)$/;
const IMAGE_TYPE: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

export const FILE_TYPES = ".pdf,.docx,.md,.markdown,.txt,.html,.htm,.srt,.vtt,.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.m4a,.ogg,.oga,.flac,.aac,.opus,.mp4,.webm,.mov,.mkv,.m4v";

interface ReadOpts {
  lang: Lang;
  /** Asked before the first Whisper download; false cancels. */
  allowWhisper: (mb: number) => boolean;
}

async function readFile(f: File, opts: ReadOpts): Promise<{ kind: SourceKind; sections: Section[] }> {
  const name = f.name.toLowerCase();
  if (IMAGE.test(name)) {
    const ext = name.split(".").pop()!;
    const reading = await readImage(await makeCtx(), new Uint8Array(await f.arrayBuffer()), f.type || IMAGE_TYPE[ext], opts.lang);
    return { kind: "image", sections: extractImage(reading) };
  }
  if (AUDIO.test(name) || VIDEO.test(name)) {
    const size = useStore.getState().settings.whisper;
    if (!whisperCached(size) && !opts.allowWhisper(WHISPER_SIZE_MB[size])) throw new Error("cancelled");
    return { kind: VIDEO.test(name) ? "video" : "audio", sections: extractTranscript(await transcribeTimed(f, size)) };
  }
  if (name.endsWith(".srt") || name.endsWith(".vtt")) return { kind: "transcript", sections: extractTranscript(parseSubtitles(await f.text())) };
  if (name.endsWith(".pdf")) {
    const { preparePdfWorker } = await import("@kuttab/kb/pdf-browser");
    await preparePdfWorker();
    return { kind: "pdf", sections: await extractPdf(await f.arrayBuffer()) };
  }
  if (name.endsWith(".docx")) return { kind: "docx", sections: await extractDocx(await f.arrayBuffer()) };
  if (name.endsWith(".md") || name.endsWith(".markdown")) return { kind: "markdown", sections: extractMarkdown(await f.text()) };
  if (name.endsWith(".html") || name.endsWith(".htm")) return { kind: "url", sections: extractHtml(await f.text()).sections };
  return { kind: "text", sections: extractPlain(await f.text()) };
}

export function Sources() {
  const t = useT();
  useStore((s) => s.kbVersion);
  const { kb } = services();
  const sources = kb.listSources().sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const counts = new Map<string, number>();
  for (const c of kb.snapshot().chunks) counts.set(c.sourceId, (counts.get(c.sourceId) ?? 0) + 1);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const uiLang = useStore((s) => s.settings.uiLang);
  const lang: Lang = useStore((s) => s.profile?.lang) ?? uiLang;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(undefined);
    try {
      await fn();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="sources">
      <h1>{t("sources")}</h1>
      <p className="muted">{t("sourcesHelp")}</p>
      {err !== undefined && <ErrorBox error={err} />}
      {busy && <Spinner label={t("adding")} />}

      <div className="grid2">
        <Card>
          <h2>{t("addText")}</h2>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await addSource(title, "text", extractPlain(text));
                setTitle("");
                setText("");
              });
            }}
          >
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePh")} dir="auto" disabled={busy} />
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("textPh")} rows={6} dir="auto" disabled={busy} />
            <button className="primary" type="submit" disabled={busy || !text.trim()}>
              {t("add")}
            </button>
          </form>
        </Card>
        <Card>
          <h2>{t("addFile")}</h2>
          <label className="file-button">
            {t("addFile")}
            <input
              type="file"
              accept={FILE_TYPES}
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                void run(async () => {
                  const read = await readFile(f, { lang, allowWhisper: (mb) => confirm(t("whisperConfirm", { size: `${mb} MB` })) }).catch((e) => {
                    if (e instanceof Error && e.message === "cancelled") return undefined;
                    throw e;
                  });
                  if (!read) return;
                  const { kind, sections } = read;
                  await addSource(f.name.replace(/\.[^.]+$/, ""), kind, sections, f.name);
                });
              }}
            />
          </label>
          <p className="muted small">{t("fileTypesHelp")}</p>
          <h2>{t("addUrl")}</h2>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const u = new URL(url.trim());
                if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http and https links are supported.");
                if (youtubeId(u.href)) {
                  const v = await fetchYoutubeTranscript(u.href, services().platform.fetch, lang);
                  await addSource(v.title, "video", extractTranscript(v.segments), u.href);
                  setUrl("");
                  return;
                }
                const res = await services().platform.fetch(u.href);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const page = extractHtml(await res.text());
                await addSource(page.title || u.hostname, "url", page.sections, u.href);
                setUrl("");
              });
            }}
          >
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("urlPh")} dir="ltr" type="url" disabled={busy} />
            <button type="submit" disabled={busy || !url.trim()}>
              {t("add")}
            </button>
          </form>
        </Card>
      </div>

      <Card>
        {sources.length === 0 ? (
          <p className="muted">{t("noSources")}</p>
        ) : (
          <ul className="plain">
            {sources.map((s) => (
              <li key={s.id} className="row">
                <span dir="auto">
                  <strong>{s.title}</strong> <small className="muted">
                    {s.kind} · {counts.get(s.id) ?? 0} {t("chunks")}
                  </small>
                </span>
                <button
                  className="link danger"
                  onClick={() => {
                    if (!confirm(t("deleteConfirm"))) return;
                    kb.remove(s.id);
                    void saveKb(kb.size === 0 ? "" : undefined);
                  }}
                >
                  {t("remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {sources.length > 0 && <Ask />}
    </main>
  );
}

function Ask() {
  const t = useT();
  const uiLang = useStore((s) => s.settings.uiLang);
  const profileLang = useStore((s) => s.profile?.lang);
  const lang: Lang = profileLang ?? uiLang;
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<GroundedAnswer>();
  const [err, setErr] = useState<unknown>();

  const ask = async () => {
    setBusy(true);
    setErr(undefined);
    setAns(undefined);
    try {
      setAns(await askGrounded(await makeCtx(), services().kb, q.trim(), /[؀-ۿ]/.test(q) ? "ar" : lang, await kbEmbed()));
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="ask">
      <h2>{t("ask")}</h2>
      <form
        className="answer-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) void ask();
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("askPh")} dir="auto" disabled={busy} />
        <MicButton lang={lang} onText={(s) => setQ((d) => (d ? `${d} ${s}` : s))} />
        <button className="primary" type="submit" disabled={busy || !q.trim()}>
          {t("askBtn")}
        </button>
      </form>
      {busy && <Spinner label={t("thinking")} />}
      {err !== undefined && <ErrorBox error={err} onRetry={ask} />}
      {ans && (
        <div className={ans.refused ? "verdict bad" : "answer"}>
          {ans.refused && <strong>{t("refused")}</strong>}
          <Markdown text={ans.answer} />
          {ans.citations.length > 0 && (
            <ol className="plain small muted">
              {ans.citations.map((c) => (
                <li key={c.n} dir="auto">
                  [{c.n}] {c.title}
                  {c.locator ? ` — ${c.locator}` : ""}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}
