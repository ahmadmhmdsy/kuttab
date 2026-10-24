// A provider's realtime voice (T-25): Gemini Live or OpenAI Realtime speaks the
// tutor's lines and transcribes the learner, over a WebSocket opened with the
// learner's own key. The tutor's words still come from the chosen teacher model;
// the realtime model only reads them aloud and listens.
import type { Dialect, Lang } from "@kuttab/engine";
import { DIALECT_NAME } from "@kuttab/engine";
import { keyId } from "./ai.ts";
import { MIC_RATE, base64Pcm16, pcm16Base64, resample } from "./mic.ts";
import { services } from "./state.ts";

export type RealtimeProvider = "google" | "openai";

export interface RealtimeVoice {
  /** Speaks one line; resolves when the audio has played or the signal aborts. */
  speak(text: string, signal: AbortSignal): Promise<void>;
  /** 16 kHz mono samples to text. */
  transcribe(audio: Float32Array): Promise<string>;
  close(): void;
}

const OUT_RATE = 24000;

/** Plays streamed 24 kHz PCM chunks back to back. */
class PcmPlayer {
  private ctx?: AudioContext;
  private at = 0;
  private nodes = new Set<AudioBufferSourceNode>();

  push(samples: Float32Array): void {
    this.ctx ??= new AudioContext({ sampleRate: OUT_RATE });
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const buf = this.ctx.createBuffer(1, samples.length, OUT_RATE);
    buf.getChannelData(0).set(samples);
    const node = this.ctx.createBufferSource();
    node.buffer = buf;
    node.connect(this.ctx.destination);
    const start = Math.max(this.at, this.ctx.currentTime + 0.05);
    node.start(start);
    this.at = start + buf.duration;
    this.nodes.add(node);
    node.onended = () => this.nodes.delete(node);
  }

  /** Resolves once everything queued has played. */
  drained(signal: AbortSignal): Promise<void> {
    const left = this.ctx ? this.at - this.ctx.currentTime : 0;
    if (left <= 0 || signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const id = setTimeout(resolve, left * 1000 + 50);
      signal.addEventListener("abort", () => (clearTimeout(id), resolve()), { once: true });
    });
  }

  stop(): void {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        // not started yet or already ended
      }
    }
    this.nodes.clear();
    this.at = 0;
  }

  close(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = undefined;
  }
}

type Msg = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** One socket, opened on first use and again after it drops; one exchange at a time. */
class Socket {
  private ws?: Promise<WebSocket>;
  private handler?: (m: Msg) => void;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private open: () => WebSocket,
    /** What to send once connected, and the message that says the session is ready. */
    private hello: (ws: WebSocket) => void,
    private ready: (m: Msg) => boolean,
    private errorOf: (m: Msg) => string | undefined = () => undefined,
  ) {}

  private connect(): Promise<WebSocket> {
    if (this.ws) return this.ws;
    const text = new TextDecoder();
    this.ws = new Promise<WebSocket>((resolve, reject) => {
      const ws = this.open();
      ws.binaryType = "arraybuffer";
      let up = false;
      ws.onopen = () => this.hello(ws);
      ws.onmessage = (e) => {
        const m = JSON.parse(typeof e.data === "string" ? e.data : text.decode(e.data as ArrayBuffer)) as Msg;
        const err = this.errorOf(m);
        if (!up && err) return reject(new Error(err));
        if (!up && this.ready(m)) {
          up = true;
          return resolve(ws);
        }
        this.handler?.(m);
      };
      ws.onerror = () => !up && reject(new Error("realtime voice: connection failed"));
      ws.onclose = (e) => {
        this.ws = undefined;
        if (!up) reject(new Error(`realtime voice: ${e.reason || `closed (${e.code})`}`));
        this.handler?.({ _closed: e.reason || `closed (${e.code})` });
      };
    });
    this.ws.catch(() => (this.ws = undefined));
    return this.ws;
  }

  /** Sends, then feeds replies to `on` until it returns true; serialized with other exchanges. */
  exchange(send: (ws: WebSocket) => void, on: (m: Msg) => boolean, signal?: AbortSignal): Promise<void> {
    const run = async () => {
      const ws = await this.connect();
      if (signal?.aborted) return;
      await new Promise<void>((resolve, reject) => {
        const finish = (err?: Error) => {
          this.handler = undefined;
          signal?.removeEventListener("abort", abort);
          if (err) reject(err);
          else resolve();
        };
        const abort = () => finish();
        signal?.addEventListener("abort", abort, { once: true });
        this.handler = (m) => {
          if (m._closed) return finish(new Error(`realtime voice: ${m._closed}`));
          const err = this.errorOf(m);
          if (err) return finish(new Error(err));
          try {
            if (on(m)) finish();
          } catch (e) {
            finish(e as Error);
          }
        };
        send(ws);
      });
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  close(): void {
    void this.ws?.then((ws) => ws.close()).catch(() => undefined);
    this.ws = undefined;
  }
}

const dialectNote = (lang: Lang, dialect?: Dialect) =>
  lang === "ar" && dialect && dialect !== "msa" ? ` Use a natural ${DIALECT_NAME[dialect]} Arabic accent.` : "";

const READ_ALOUD = "You are a voice. Read the user's text aloud exactly as written, warmly and clearly, like a teacher. Do not add, answer, translate or comment on anything.";

const GEMINI_WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const GEMINI_SPEAK = "models/gemini-3.1-flash-live-preview";
const GEMINI_LISTEN = "models/gemini-3.5-transcribe-live";

function gemini(key: string, lang: Lang, dialect?: Dialect): RealtimeVoice {
  const url = `${GEMINI_WS}?key=${encodeURIComponent(key)}`;
  const errorOf = (m: Msg) => (m.error ? String(m.error.message ?? m.error) : undefined);
  const player = new PcmPlayer();
  const speaker = new Socket(
    () => new WebSocket(url),
    (ws) =>
      ws.send(
        JSON.stringify({
          setup: {
            model: GEMINI_SPEAK,
            generationConfig: { responseModalities: ["AUDIO"] },
            systemInstruction: { parts: [{ text: READ_ALOUD + dialectNote(lang, dialect) }] },
          },
        }),
      ),
    (m) => "setupComplete" in m,
    errorOf,
  );
  const listener = new Socket(
    () => new WebSocket(url),
    (ws) => ws.send(JSON.stringify({ setup: { model: GEMINI_LISTEN, inputAudioTranscription: {} } })),
    (m) => "setupComplete" in m,
    errorOf,
  );
  return {
    async speak(text, signal) {
      const stop = () => player.stop();
      signal.addEventListener("abort", stop, { once: true });
      try {
        await speaker.exchange(
          (ws) => ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } })),
          (m) => {
            for (const p of m.serverContent?.modelTurn?.parts ?? []) if (p.inlineData?.data) player.push(base64Pcm16(p.inlineData.data));
            return !!m.serverContent?.turnComplete;
          },
          signal,
        );
        await player.drained(signal);
      } finally {
        signal.removeEventListener("abort", stop);
      }
    },
    async transcribe(audio) {
      let text = "";
      let interim = "";
      // The server's own VAD ends the turn only after it hears quiet, so trail some.
      const padded = new Float32Array(audio.length + MIC_RATE * 1.5);
      padded.set(audio);
      // A reply that stalls ends with what was heard so far.
      const ctl = new AbortController();
      let idle = setTimeout(() => ctl.abort(), 15_000);
      try {
        await listener.exchange(
          (ws) => {
            // About a second per message keeps frames well under the socket's size limit.
            for (let i = 0; i < padded.length; i += MIC_RATE)
              ws.send(JSON.stringify({ realtimeInput: { audio: { data: pcm16Base64(padded.subarray(i, i + MIC_RATE)), mimeType: `audio/pcm;rate=${MIC_RATE}` } } }));
            ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
          },
          (m) => {
            const sc = m.serverContent;
            if (sc?.interimInputTranscription?.text) {
              interim = sc.interimInputTranscription.text;
              clearTimeout(idle);
              idle = setTimeout(() => ctl.abort(), 2500);
            }
            if (sc?.inputTranscription?.text) text += sc.inputTranscription.text;
            return !!(sc?.generationComplete || sc?.turnComplete);
          },
          ctl.signal,
        );
      } finally {
        clearTimeout(idle);
      }
      // A late final for a stalled turn must not land in the next one.
      if (ctl.signal.aborted) listener.close();
      return (text || interim).trim();
    },
    close() {
      player.close();
      speaker.close();
      listener.close();
    },
  };
}

const OPENAI_WS = "wss://api.openai.com/v1/realtime?model=gpt-realtime";

function openai(key: string, lang: Lang, dialect?: Dialect): RealtimeVoice {
  const player = new PcmPlayer();
  const sock = new Socket(
    () => new WebSocket(OPENAI_WS, ["realtime", `openai-insecure-api-key.${key}`]),
    (ws) =>
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            output_modalities: ["audio"],
            instructions: READ_ALOUD + dialectNote(lang, dialect),
            audio: {
              // No server turn-taking: the app decides when a turn ends (hold-to-talk or its own VAD).
              input: { format: { type: "audio/pcm", rate: OUT_RATE }, transcription: { model: "gpt-4o-mini-transcribe", language: lang }, turn_detection: null },
              output: { format: { type: "audio/pcm", rate: OUT_RATE }, voice: "marin" },
            },
          },
        }),
      ),
    (m) => m.type === "session.updated",
    (m) => (m.type === "error" ? String(m.error?.message ?? "realtime error") : undefined),
  );
  return {
    async speak(text, signal) {
      const stop = () => player.stop();
      signal.addEventListener("abort", stop, { once: true });
      try {
        await sock.exchange(
          (ws) =>
            ws.send(
              JSON.stringify({
                type: "response.create",
                // Outside the conversation, so lines do not pile up as context.
                response: { conversation: "none", output_modalities: ["audio"], instructions: `${READ_ALOUD}${dialectNote(lang, dialect)}\n\nText:\n${text}` },
              }),
            ),
          (m) => {
            if ((m.type === "response.output_audio.delta" || m.type === "response.audio.delta") && m.delta) player.push(base64Pcm16(m.delta));
            return m.type === "response.done";
          },
          signal,
        );
        await player.drained(signal);
      } finally {
        signal.removeEventListener("abort", stop);
      }
    },
    async transcribe(audio) {
      let text = "";
      let item = "";
      await sock.exchange(
        (ws) => {
          const pcm = resample(audio, MIC_RATE, OUT_RATE);
          for (let i = 0; i < pcm.length; i += OUT_RATE) ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: pcm16Base64(pcm.subarray(i, i + OUT_RATE)) }));
          ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        },
        (m) => {
          if (m.type === "input_audio_buffer.committed") item = m.item_id;
          if (m.type === "conversation.item.input_audio_transcription.completed") {
            text = m.transcript ?? "";
            // The committed audio stays in the conversation; drop it.
            if (item) sock.exchange((ws) => ws.send(JSON.stringify({ type: "conversation.item.delete", item_id: item })), (r) => r.type === "conversation.item.deleted").catch(() => undefined);
            return true;
          }
          if (m.type === "conversation.item.input_audio_transcription.failed") throw new Error(m.error?.message ?? "transcription failed");
          return false;
        },
      );
      return text.trim();
    },
    close() {
      player.close();
      sock.close();
    },
  };
}

/** The realtime voice for a provider, with the key from the keychain. */
export async function realtimeVoice(provider: RealtimeProvider, lang: Lang, dialect?: Dialect): Promise<RealtimeVoice> {
  const key = await services().platform.secrets.get(keyId(provider));
  if (!key) throw new Error(`No ${provider === "google" ? "Google" : "OpenAI"} key saved. Add it in Settings → Models.`);
  return provider === "google" ? gemini(key, lang, dialect) : openai(key, lang, dialect);
}
