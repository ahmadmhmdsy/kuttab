// The learner's voice pipeline for one live session (T-25): who speaks the
// tutor's lines (system voice, Piper, or a provider's realtime voice) and who
// hears the learner (local Whisper, or the realtime voice). Any failure falls
// back to the system voice and Whisper, and is reported once.
import type { Dialect, Lang } from "@kuttab/engine";
import { PIPER_MB, piperReady, piperSynth, playBlob } from "./piper.ts";
import { realtimeVoice, type RealtimeVoice } from "./realtime.ts";
import { speakAsync, stopSpeaking, transcribePcm } from "./speech.ts";
import type { VoiceSettings, WhisperSize } from "./state.ts";

export interface SessionVoice {
  speak(text: string, signal: AbortSignal): Promise<void>;
  /** Says which line comes after the one being spoken, so it can be prepared early. */
  next(text: string): void;
  /** 16 kHz mono samples to text. */
  hear(audio: Float32Array): Promise<string>;
  /** True when hearing needs the local Whisper model (so its download is asked about). */
  readonly usesWhisper: boolean;
  stop(): void;
  close(): void;
}

export interface VoiceHooks {
  /** Asks before a large download; false keeps the system voice. */
  confirm(sizeMb: number): boolean;
  /** One message when the chosen engine failed and the system voice took over. */
  onFallback(error: unknown): void;
}

export async function sessionVoice(v: VoiceSettings, lang: Lang, whisper: WhisperSize, hooks: VoiceHooks): Promise<SessionVoice> {
  const dialect: Dialect | undefined = lang === "ar" ? v.dialect : undefined;
  let engine = v.engine;
  let realtime: RealtimeVoice | undefined;
  let fellBack = false;
  const fallback = (e: unknown) => {
    engine = "system";
    if (!fellBack) hooks.onFallback(e);
    fellBack = true;
  };

  if (engine === "piper" && !(await piperReady(lang)) && !hooks.confirm(PIPER_MB)) engine = "system";
  if (engine === "realtime") {
    try {
      realtime = await realtimeVoice(v.realtime, lang, dialect);
    } catch (e) {
      fallback(e);
    }
  }

  // Piper: synthesize the next line while this one plays.
  let ahead: { text: string; wav: Promise<Blob> } | undefined;
  const synth = (text: string) => (ahead?.text === text ? ahead.wav : piperSynth(text, lang));
  const abortAll = new Set<AbortController>();

  const voice: SessionVoice = {
    get usesWhisper() {
      return !realtime;
    },
    async speak(text, signal) {
      const ctl = new AbortController();
      const stop = () => ctl.abort();
      signal.addEventListener("abort", stop, { once: true });
      abortAll.add(ctl);
      try {
        if (engine === "piper") {
          try {
            const wav = await synth(text);
            ahead = undefined;
            await playBlob(wav, ctl.signal);
            return;
          } catch (e) {
            if (ctl.signal.aborted) return;
            fallback(e);
          }
        }
        if (engine === "realtime" && realtime) {
          try {
            await realtime.speak(text, ctl.signal);
            return;
          } catch (e) {
            if (ctl.signal.aborted) return;
            fallback(e);
          }
        }
        await speakAsync(text, lang, ctl.signal, dialect);
      } finally {
        signal.removeEventListener("abort", stop);
        abortAll.delete(ctl);
      }
    },
    next(text) {
      if (engine === "piper" && ahead?.text !== text) {
        const wav = piperSynth(text, lang);
        wav.catch(() => undefined);
        ahead = { text, wav };
      }
    },
    async hear(audio) {
      if (realtime) {
        try {
          return await realtime.transcribe(audio);
        } catch (e) {
          fallback(e);
          realtime.close();
          realtime = undefined;
        }
      }
      return transcribePcm(audio, whisper, lang);
    },
    stop() {
      for (const c of abortAll) c.abort();
      stopSpeaking();
    },
    close() {
      voice.stop();
      realtime?.close();
    },
  };
  return voice;
}
