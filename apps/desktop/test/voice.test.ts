import { describe, expect, it } from "vitest";
import { Vad, concat } from "../src/vad.ts";
import { base64Pcm16, pcm16Base64, resample } from "../src/mic.ts";

const RATE = 16000;
const FRAME = 1024;
const frame = (amp: number) => Float32Array.from({ length: FRAME }, (_, i) => amp * Math.sin(i / 3));
/** Feeds `ms` of a level in frame-sized pieces. */
const feed = (vad: Vad, amp: number, ms: number) => {
  for (let i = 0; i < Math.ceil((ms * RATE) / 1000 / FRAME); i++) vad.push(frame(amp));
};

describe("always-listening VAD", () => {
  it("cuts speech between silences into one utterance, with a pre-roll", () => {
    const out: Float32Array[] = [];
    let starts = 0;
    const vad = new Vad((a) => out.push(a), () => starts++);
    feed(vad, 0.001, 1000);
    feed(vad, 0.2, 1200);
    expect(vad.isSpeaking).toBe(true);
    feed(vad, 0.001, 1000);
    expect(starts).toBe(1);
    expect(out).toHaveLength(1);
    const sec = out[0]!.length / RATE;
    // 1.2 s of speech, plus the pre-roll and the closing quiet.
    expect(sec).toBeGreaterThan(1.3);
    expect(sec).toBeLessThan(2.4);
  });

  it("drops clicks and ignores everything while muted", () => {
    const out: Float32Array[] = [];
    const vad = new Vad((a) => out.push(a));
    feed(vad, 0.001, 500);
    feed(vad, 0.3, 140); // a cough
    feed(vad, 0.001, 1000);
    expect(out).toHaveLength(0);

    vad.setMuted(true);
    feed(vad, 0.3, 1500);
    feed(vad, 0.001, 1000);
    expect(out).toHaveLength(0);
    vad.setMuted(false);
    feed(vad, 0.3, 800);
    feed(vad, 0.001, 1000);
    expect(out).toHaveLength(1);
  });

  it("adapts to a noisy room instead of hearing the noise as speech", () => {
    const out: Float32Array[] = [];
    const vad = new Vad((a) => out.push(a));
    feed(vad, 0.006, 4000); // steady fan noise just above the fixed minimum
    expect(out).toHaveLength(0);
    feed(vad, 0.3, 800);
    feed(vad, 0.006, 1500);
    expect(out).toHaveLength(1);
  });

  it("sends long speech anyway once it passes the cap", () => {
    const out: Float32Array[] = [];
    const vad = new Vad((a) => out.push(a), undefined, { maxMs: 2000 });
    feed(vad, 0.001, 300);
    feed(vad, 0.3, 4500);
    expect(out.length).toBeGreaterThanOrEqual(2);
  });
});

describe("PCM helpers", () => {
  it("round-trips int16 base64 and resamples by length", () => {
    const a = Float32Array.from([0, 0.5, -0.5, 0.25, -1]);
    const back = base64Pcm16(pcm16Base64(a));
    for (let i = 0; i < a.length; i++) expect(back[i]).toBeCloseTo(a[i]!, 3);
    expect(resample(new Float32Array(16000), 16000, 24000)).toHaveLength(24000);
    expect(concat([a, a])).toHaveLength(10);
  });
});
