// Voice activity detection for always-listening mode (T-25). Plain energy VAD
// with an adaptive noise floor: cheap, local, and good enough for one learner at
// a desk. Frames are 16 kHz mono; utterances come out with a short pre-roll so
// the first syllable is not cut.

export interface VadOptions {
  rate: number;
  /** Loud frames in a row before speech starts. */
  startFrames: number;
  /** Quiet time that ends an utterance. */
  endMs: number;
  /** Shorter utterances (coughs, clicks) are dropped. */
  minMs: number;
  /** Longer speech is cut and sent anyway. */
  maxMs: number;
  preRollMs: number;
  /** The level never counts as speech below this, however quiet the room. */
  minLevel: number;
}

export const VAD_DEFAULTS: VadOptions = { rate: 16000, startFrames: 2, endMs: 700, minMs: 300, maxMs: 30_000, preRollMs: 300, minLevel: 0.01 };

export function rms(frame: Float32Array): number {
  let sum = 0;
  for (const x of frame) sum += x * x;
  return Math.sqrt(sum / (frame.length || 1));
}

export class Vad {
  private opts: VadOptions;
  private floor = 0.003;
  private loud = 0;
  private speaking = false;
  private quietMs = 0;
  private spokenMs = 0;
  /** How much of spokenMs is pre-roll, which is not speech. */
  private rollMs = 0;
  private buf: Float32Array[] = [];
  private pre: Float32Array[] = [];
  private preMs = 0;
  private muted = false;

  constructor(
    private onUtterance: (audio: Float32Array) => void,
    private onStart?: () => void,
    opts: Partial<VadOptions> = {},
  ) {
    this.opts = { ...VAD_DEFAULTS, ...opts };
  }

  /** While muted (the tutor is talking, or an answer is being read) frames are ignored and any speech so far is dropped. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.reset();
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  push(frame: Float32Array): void {
    if (this.muted) return;
    const ms = (frame.length / this.opts.rate) * 1000;
    const level = rms(frame);
    const threshold = Math.max(this.floor * 3, this.opts.minLevel);
    const loud = level > threshold;
    if (!this.speaking) {
      if (!loud) this.floor = Math.max(0.0005, this.floor * 0.95 + level * 0.05);
      this.pre.push(frame);
      this.preMs += ms;
      while (this.pre.length > 1 && this.preMs - (this.pre[0]!.length / this.opts.rate) * 1000 >= this.opts.preRollMs) {
        this.preMs -= (this.pre.shift()!.length / this.opts.rate) * 1000;
      }
      this.loud = loud ? this.loud + 1 : 0;
      if (this.loud >= this.opts.startFrames) {
        this.speaking = true;
        this.buf = this.pre;
        this.spokenMs = this.preMs;
        this.rollMs = this.preMs;
        this.pre = [];
        this.preMs = 0;
        this.quietMs = 0;
        this.onStart?.();
      }
      return;
    }
    this.buf.push(frame);
    this.spokenMs += ms;
    this.quietMs = loud ? 0 : this.quietMs + ms;
    if (this.quietMs >= this.opts.endMs || this.spokenMs >= this.opts.maxMs) this.end();
  }

  private end(): void {
    const voiced = this.spokenMs - this.rollMs - this.quietMs;
    const parts = this.buf;
    this.reset();
    if (voiced < this.opts.minMs) return;
    this.onUtterance(concat(parts));
  }

  private reset(): void {
    this.speaking = false;
    this.loud = 0;
    this.quietMs = 0;
    this.spokenMs = 0;
    this.rollMs = 0;
    this.buf = [];
    this.pre = [];
    this.preMs = 0;
  }
}

export function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
