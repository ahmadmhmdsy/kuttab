// Speech: text-to-speech through the system voices, and speech input through a
// local Whisper model (transformers.js). Audio never leaves the machine.
import type { Lang } from "@kuttab/engine";
import type { WhisperSize } from "./state.ts";

// ---------- TTS ----------

export function canSpeak(): boolean {
  return typeof speechSynthesis !== "undefined";
}

function voiceFor(lang: Lang): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ?? undefined;
}

export function speak(text: string, lang: Lang, onEnd?: () => void): void {
  if (!canSpeak()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/```[\s\S]*?```/g, "").replace(/[#*_`>[\]()]/g, ""));
  u.lang = lang === "ar" ? "ar-SA" : "en-US";
  const v = voiceFor(lang);
  if (v) u.voice = v;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) speechSynthesis.cancel();
}

/** Splits spoken text into sentences, so read-aloud can start on the first one. */
export function sentences(text: string): string[] {
  return (text.match(/[^.!?؟…\n]+[.!?؟…]*\s*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

/** Speaks one sentence; resolves when it ends or the signal aborts (which stops the voice). */
export function speakAsync(text: string, lang: Lang, signal: AbortSignal): Promise<void> {
  if (!canSpeak() || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      signal.removeEventListener("abort", stop);
      resolve();
    };
    const stop = () => {
      speechSynthesis.cancel();
      done();
    };
    signal.addEventListener("abort", stop, { once: true });
    const u = new SpeechSynthesisUtterance(text.replace(/[#*_`>[\]()]/g, ""));
    u.lang = lang === "ar" ? "ar-SA" : "en-US";
    const v = voiceFor(lang);
    if (v) u.voice = v;
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  });
}

// ---------- Whisper ----------

export const WHISPER_SIZE_MB: Record<WhisperSize, number> = { tiny: 40, base: 80, small: 250 };

const fetchedKey = (size: WhisperSize) => `kuttab.whisper.${size}`;

/** True once the model files have been downloaded (cached by the browser). */
export function whisperCached(size: WhisperSize): boolean {
  try {
    return localStorage.getItem(fetchedKey(size)) === "1";
  } catch {
    return false;
  }
}

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;
const pipes = new Map<WhisperSize, Promise<Asr>>();

function loadWhisper(size: WhisperSize): Promise<Asr> {
  let p = pipes.get(size);
  if (!p) {
    p = import("@huggingface/transformers").then(async ({ pipeline, env }) => {
      // Load the ONNX runtime from the app (vite.config.ts copies it to /ort/),
      // not from transformers.js' default CDN, and without blob: URLs, so the CSP holds.
      const ort = new URL("/ort/", location.href).href;
      const suffix = typeof navigator !== "undefined" && "gpu" in navigator ? ".asyncify" : "";
      env.useWasmCache = false;
      if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = { mjs: `${ort}ort-wasm-simd-threaded${suffix}.mjs`, wasm: `${ort}ort-wasm-simd-threaded${suffix}.wasm` };
      const asr = (await pipeline("automatic-speech-recognition", `onnx-community/whisper-${size}`, { dtype: "q8" })) as unknown as Asr;
      try {
        localStorage.setItem(fetchedKey(size), "1");
      } catch {
        // storage blocked; we will just ask again next time
      }
      return asr;
    });
    p.catch(() => pipes.delete(size));
    pipes.set(size, p);
  }
  return p;
}

async function decode16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buf.getChannelData(0);
  } finally {
    void ctx.close();
  }
}

export async function transcribe(blob: Blob, size: WhisperSize, lang: Lang): Promise<string> {
  const [asr, audio] = await Promise.all([loadWhisper(size), decode16k(blob)]);
  const out = await asr(audio, { language: lang === "ar" ? "arabic" : "english", task: "transcribe", chunk_length_s: 30 });
  return (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text).trim();
}

export interface Recorder {
  stop(): Promise<Blob>;
}

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => parts.push(e.data);
  rec.start();
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(parts, { type: rec.mimeType }));
        };
        rec.stop();
      }),
  };
}
