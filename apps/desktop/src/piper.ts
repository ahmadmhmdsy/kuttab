// Piper: a natural neural voice that runs on this machine (T-25). Voices come
// from Hugging Face once (about 63 MB each) and are kept in the browser's private
// file storage (OPFS); the ONNX runtime and phonemizer load from the app itself
// (vite.config.ts serves /ort/ and /piper/).
import type { Lang } from "@kuttab/engine";

/** There is one Arabic Piper voice (Jordanian speaker, read as MSA); dialects keep it. */
export const PIPER_VOICE: Record<Lang, string> = { en: "en_US-lessac-low", ar: "ar_JO-kareem-low" };
export const PIPER_MB = 63;

type PiperModule = typeof import("@mintplex-labs/piper-tts-web");
let mod: Promise<PiperModule> | undefined;
const piper = () => (mod ??= import("@mintplex-labs/piper-tts-web"));

/** True when this language's voice is already on disk. */
export async function piperReady(lang: Lang): Promise<boolean> {
  try {
    return (await (await piper()).stored()).includes(PIPER_VOICE[lang]);
  } catch {
    return false;
  }
}

type Session = Awaited<ReturnType<PiperModule["TtsSession"]["create"]>>;
let session: Promise<Session> | undefined;
let sessionVoice = "";

function sessionFor(lang: Lang, progress?: (pct: number) => void): Promise<Session> {
  const voiceId = PIPER_VOICE[lang];
  if (session && sessionVoice === voiceId) return session;
  sessionVoice = voiceId;
  session = piper().then(({ TtsSession }) => {
    // The library keeps one instance and ignores a new voiceId on it.
    (TtsSession as unknown as { _instance: unknown })._instance = null;
    return TtsSession.create({
      voiceId,
      progress: (p) => progress?.(p.total ? Math.round((p.loaded * 100) / p.total) : 0),
      wasmPaths: {
        onnxWasm: new URL("/ort/", location.href).href,
        piperData: new URL("/piper/piper_phonemize.data", location.href).href,
        piperWasm: new URL("/piper/piper_phonemize.wasm", location.href).href,
      },
    });
  });
  session.catch(() => {
    session = undefined;
    sessionVoice = "";
  });
  return session;
}

let queue: Promise<unknown> = Promise.resolve();

/** Text to a WAV blob; downloads the voice first if needed (callers confirm that). One at a time: an ONNX session runs one inference. */
export function piperSynth(text: string, lang: Lang, progress?: (pct: number) => void): Promise<Blob> {
  const run = async () => (await sessionFor(lang, progress)).predict(text);
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

let ctx: AudioContext | undefined;

/** Plays a WAV blob; resolves when it ends or the signal aborts (which stops it). */
export async function playBlob(blob: Blob, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  if (signal.aborted) return;
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.connect(ctx.destination);
  await new Promise<void>((resolve) => {
    const stop = () => {
      try {
        node.stop();
      } catch {
        // already ended
      }
      resolve();
    };
    signal.addEventListener("abort", stop, { once: true });
    node.onended = () => {
      signal.removeEventListener("abort", stop);
      resolve();
    };
    node.start();
  });
}
