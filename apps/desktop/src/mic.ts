// The microphone as a stream of 16 kHz mono frames (T-25), for always-listening
// mode and for realtime voices. The browser's echo cancellation keeps most of
// the tutor's own voice out; the VAD is also muted while the tutor speaks.

export interface Mic {
  close(): void;
}

export const MIC_RATE = 16000;

export async function openMic(onFrame: (frame: Float32Array) => void): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  // A 16 kHz context resamples the mic for us (Chromium/WebView2).
  const ctx = new AudioContext({ sampleRate: MIC_RATE });
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(1024, 1, 1);
  proc.onaudioprocess = (e) => onFrame(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(proc);
  // A processor only runs when connected to the output; it writes silence.
  proc.connect(ctx.destination);
  return {
    close() {
      proc.onaudioprocess = null;
      src.disconnect();
      proc.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}

/** Float samples to little-endian int16, base64 (what realtime APIs take). */
export function pcm16Base64(audio: Float32Array): string {
  const bytes = new Uint8Array(audio.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < audio.length; i++) view.setInt16(i * 2, Math.max(-1, Math.min(1, audio[i]!)) * 0x7fff, true);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Base64 little-endian int16 to float samples. */
export function base64Pcm16(b64: string): Float32Array {
  const bin = atob(b64);
  const out = new Float32Array(bin.length >> 1);
  for (let i = 0; i < out.length; i++) {
    const v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
    out[i] = (v >= 0x8000 ? v - 0x10000 : v) / 0x8000;
  }
  return out;
}

/** Linear resampling, e.g. 16 kHz to the 24 kHz OpenAI Realtime takes. */
export function resample(audio: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return audio;
  const out = new Float32Array(Math.round((audio.length * to) / from));
  const step = from / to;
  for (let i = 0; i < out.length; i++) {
    const x = i * step;
    const j = Math.floor(x);
    const a = audio[j] ?? 0;
    const b = audio[j + 1] ?? a;
    out[i] = a + (b - a) * (x - j);
  }
  return out;
}
