import { describe, expect, it } from "vitest";
import {
  KnowledgeBase,
  extractImage,
  extractTranscript,
  fetchYoutubeTranscript,
  formatTime,
  parseSubtitles,
  parseTimedText,
  youtubeId,
  type Source,
  type SourceKind,
} from "../src/index.ts";

const src = (id: string, kind: SourceKind): Source => ({ id, title: id, kind, addedAt: "2026-10-24T00:00:00+03:00" });

describe("media sources", () => {
  it("formats times and groups speech into timed windows", () => {
    expect(formatTime(75)).toBe("1:15");
    expect(formatTime(3725)).toBe("1:02:05");
    const sections = extractTranscript(
      [
        { start: 0, end: 4, text: "Welcome." },
        { start: 30, end: 35, text: "Plants need light." },
        { start: 65, end: 70, text: "Chlorophyll is green." },
      ],
      60,
    );
    expect(sections).toEqual([
      { text: "Welcome. Plants need light.", locator: "0:00–0:35" },
      { text: "Chlorophyll is green.", locator: "1:05–1:10" },
    ]);
  });

  it("reads SRT and WebVTT subtitles", () => {
    const srt = "1\r\n00:00:01,000 --> 00:00:03,500\r\nHello <i>there</i>\r\n\r\n2\r\n00:01:02,000 --> 00:01:04,000\r\nSecond line\r\n";
    expect(parseSubtitles(srt)).toEqual([
      { start: 1, end: 3.5, text: "Hello there" },
      { start: 62, end: 64, text: "Second line" },
    ]);
    const vtt = "WEBVTT\n\n00:05.000 --> 00:07.000\nShort clock form\n";
    expect(parseSubtitles(vtt)).toEqual([{ start: 5, end: 7, text: "Short clock form" }]);
  });

  it("reads both YouTube timed-text forms and decodes entities", () => {
    const classic = '<transcript><text start="1.5" dur="2">Tom &amp;amp; Jerry&#39;s</text><text start="4" dur="1"> </text></transcript>';
    expect(parseTimedText(classic)).toEqual([{ start: 1.5, end: 3.5, text: "Tom & Jerry's" }]);
    const srv3 = '<timedtext><body><p t="2000" d="1500"><s>Hi</s><s> all</s></p></body></timedtext>';
    expect(parseTimedText(srv3)).toEqual([{ start: 2, end: 3.5, text: "Hi all" }]);
  });

  it("finds the video id in YouTube links only", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeUndefined();
    expect(youtubeId("not a url")).toBeUndefined();
  });

  it("reads a YouTube transcript from the caption track, preferring the learner's language", async () => {
    const calls: string[] = [];
    const fetch = async (url: string) => {
      calls.push(url);
      if (url.includes("youtubei/v1/player")) {
        return Response.json({
          videoDetails: { title: "Photosynthesis" },
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [
                { baseUrl: "https://yt.test/en-asr", languageCode: "en", kind: "asr" },
                { baseUrl: "https://yt.test/ar?x=1&fmt=srv3", languageCode: "ar" },
              ],
            },
          },
        });
      }
      return new Response('<transcript><text start="0" dur="3">البناء الضوئي</text></transcript>');
    };
    const t = await fetchYoutubeTranscript("https://youtu.be/dQw4w9WgXcQ", fetch, "ar");
    expect(t).toEqual({ title: "Photosynthesis", lang: "ar", segments: [{ start: 0, end: 3, text: "البناء الضوئي" }] });
    expect(calls[1]).toBe("https://yt.test/ar?x=1");
    await expect(fetchYoutubeTranscript("https://example.com", fetch)).rejects.toThrow(/not a YouTube/);
    const none = async (url: string) => (url.includes("player") ? Response.json({}) : new Response("<html></html>"));
    await expect(fetchYoutubeTranscript("https://youtu.be/dQw4w9WgXcQ", none)).rejects.toThrow(/no captions/);
  });

  it("makes every media source type searchable", async () => {
    const kb = new KnowledgeBase();
    await kb.add(src("photo", "image"), extractImage({ text: "Mitochondria: powerhouse of the cell", description: "A labelled diagram of an animal cell." }));
    await kb.add(src("lecture", "audio"), extractTranscript([{ start: 0, end: 5, text: "Today we study volcanoes and magma chambers." }]));
    await kb.add(src("clip", "video"), extractTranscript([{ start: 90, end: 95, text: "Fractions share a common denominator." }]));
    await kb.add(src("subs", "transcript"), extractTranscript(parseSubtitles("00:00:10,000 --> 00:00:12,000\nThe treaty was signed in 1648.")));
    const top = (q: string) => kb.keywordSearch(q)[0];
    expect(top("mitochondria powerhouse").chunk.locator).toBe("text in the image");
    expect(top("diagram animal cell").chunk.locator).toBe("image description");
    expect(top("magma volcanoes").source.kind).toBe("audio");
    expect(top("common denominator").chunk.locator).toBe("1:30–1:35");
    expect(top("treaty signed").source.id).toBe("subs");
  });
});
