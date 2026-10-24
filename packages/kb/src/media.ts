// Learner sources that are not text files: images, audio and video. The heavy
// work (OCR and description by a vision model, speech-to-text by Whisper) is done
// by the caller and handed in; this module turns the results into sections with
// locators a citation can point at ("image text", "1:00–2:00").
import type { Section } from "./chunk.ts";

/** A piece of speech with its start (and end) time in seconds. */
export interface TimedSegment {
  start: number;
  end?: number;
  text: string;
}

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Groups timed speech into sections of about `windowSec`, each located by its time range. */
export function extractTranscript(segments: TimedSegment[], windowSec = 60): Section[] {
  const sections: Section[] = [];
  let start = 0;
  let end = 0;
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    if (text) sections.push({ text, locator: `${formatTime(start)}–${formatTime(end)}` });
    buf = [];
  };
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    if (buf.length && seg.start - start >= windowSec) flush();
    if (!buf.length) start = seg.start;
    buf.push(text);
    end = seg.end ?? seg.start;
  }
  flush();
  return sections;
}

const clock = (t: string) => {
  const [h, m, s] = t.replace(",", ".").split(":").map(Number);
  return s === undefined ? h * 60 + m : h * 3600 + m * 60 + s;
};

/** SRT or WebVTT subtitles to timed segments. */
export function parseSubtitles(text: string): TimedSegment[] {
  const out: TimedSegment[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const m = /([\d:.,]+)\s*-->\s*([\d:.,]+)/.exec(lines[i]);
    if (!m) continue;
    const body = lines
      .slice(i + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (body) out.push({ start: clock(m[1]), end: clock(m[2]), text: body });
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (all, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e] ?? all;
  });

/** YouTube timed text: the classic `<text start dur>` form or srv3 `<p t d>` (milliseconds). */
export function parseTimedText(xml: string): TimedSegment[] {
  const out: TimedSegment[] = [];
  for (const m of xml.matchAll(/<text\s+([^>]*)>([\s\S]*?)<\/text>/g)) {
    const start = Number(/start="([\d.]+)"/.exec(m[1])?.[1] ?? 0);
    const dur = Number(/dur="([\d.]+)"/.exec(m[1])?.[1] ?? 0);
    out.push({ start, end: start + dur, text: decode(decode(m[2]).replace(/<[^>]+>/g, "")) });
  }
  if (out.length) return out.filter((s) => s.text.trim());
  for (const m of xml.matchAll(/<p\s+([^>]*)>([\s\S]*?)<\/p>/g)) {
    const t = Number(/\bt="(\d+)"/.exec(m[1])?.[1] ?? 0) / 1000;
    const d = Number(/\bd="(\d+)"/.exec(m[1])?.[1] ?? 0) / 1000;
    const text = decode(m[2].replace(/<[^>]+>/g, ""));
    if (text.trim()) out.push({ start: t, end: t + d, text });
  }
  return out;
}

/** The video id of a YouTube link, or undefined for any other link. */
export function youtubeId(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null | undefined;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v") ?? /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname)?.[1];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : undefined;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

/** Prefers a written track in `lang`, then an automatic one in `lang`, then any written, then any. */
function pickTrack(tracks: CaptionTrack[], lang?: string): CaptionTrack | undefined {
  const inLang = (t: CaptionTrack) => !!lang && t.languageCode.toLowerCase().startsWith(lang.toLowerCase());
  return tracks.find((t) => inLang(t) && t.kind !== "asr") ?? tracks.find(inLang) ?? tracks.find((t) => t.kind !== "asr") ?? tracks[0];
}

export interface OnlineTranscript {
  title: string;
  lang: string;
  segments: TimedSegment[];
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * The transcript of a YouTube video, read from its caption track (no video is
 * downloaded). Uses the public player endpoint the Android app uses, then falls
 * back to the watch page. Throws a plain message when the video has no captions.
 */
export async function fetchYoutubeTranscript(url: string, fetch: Fetch, lang?: string): Promise<OnlineTranscript> {
  const videoId = youtubeId(url);
  if (!videoId) throw new Error("This is not a YouTube video link.");
  let title = "";
  let tracks: CaptionTrack[] = [];
  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip" },
      body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: lang ?? "en" } }, videoId }),
    });
    if (res.ok) {
      const data = await res.json();
      title = data.videoDetails?.title ?? "";
      tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    }
  } catch {
    // fall through to the watch page
  }
  if (!tracks.length) {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: { "Accept-Language": lang ?? "en" } });
    const html = res.ok ? await res.text() : "";
    title ||= decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "").replace(/ - YouTube$/, "");
    const m = /"captionTracks":(\[.*?\])/.exec(html);
    if (m) tracks = JSON.parse(m[1]) as CaptionTrack[];
  }
  const track = pickTrack(tracks, lang);
  if (!track) throw new Error("This video has no captions, so there is no transcript to read.");
  const res = await fetch(track.baseUrl.replace(/&fmt=[^&]*/, ""));
  if (!res.ok) throw new Error(`Could not read the video's captions (${res.status}).`);
  const segments = parseTimedText(await res.text());
  if (!segments.length) throw new Error("The video's captions came back empty.");
  return { title: title || `YouTube video ${videoId}`, lang: track.languageCode, segments };
}

/** What a vision model read from an image: the text in it, and a description. */
export interface ImageReading {
  text: string;
  description: string;
}

export function extractImage(r: ImageReading): Section[] {
  const sections: Section[] = [];
  if (r.text.trim()) sections.push({ text: r.text.trim(), locator: "text in the image" });
  if (r.description.trim()) sections.push({ text: r.description.trim(), locator: "image description" });
  return sections;
}
