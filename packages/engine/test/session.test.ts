import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import {
  LiveSession,
  boardHistory,
  checkResults,
  learnerQuestions,
  lessonNotes,
  llmBrain,
  scriptedBrain,
  transcript,
  type Beat,
  type LessonRecord,
  type SessionEvent,
  type Speaker,
} from "../src/index.ts";

const BEATS: Beat[] = [
  { say: "A fraction is a part of a whole.", board: { kind: "diagram", title: "One pizza", content: "pie:8" } },
  { say: "Three of eight slices is three eighths.", board: { kind: "math", content: "\\frac{3}{8}" } },
  { say: "Which is bigger?", check: { question: "Which is bigger, 1/2 or 1/4?", choices: ["1/2", "1/4"], answer: "1/2", hint: "Fewer, bigger slices." } },
  { say: "Well done, that is the section." },
];

/** Speaks instantly, except the lines listed in `hold`, which wait until aborted. */
function speaker(hold: string[] = []) {
  const spoken: string[] = [];
  const s: Speaker = {
    speak: (text, signal) => {
      spoken.push(text);
      if (!hold.includes(text)) return Promise.resolve();
      return new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    },
  };
  return { s, spoken };
}

/** Resolves when the session first emits an event matching `pred`. */
function when(session: LiveSession, pred: (e: SessionEvent) => boolean): Promise<void> {
  return new Promise((resolve) => {
    const off = session.on((e) => {
      if (pred(e)) {
        off();
        resolve();
      }
    });
  });
}

let clock = 0;
const now = () => ++clock;

describe("live session", () => {
  it("plays beats in order and stops at a check", async () => {
    const { s, spoken } = speaker();
    const session = new LiveSession({ brain: scriptedBrain(BEATS), speaker: s, lang: "en", title: "Fractions", now });
    const boards: string[] = [];
    session.on((e) => e.type === "board" && boards.push(e.action.content));
    await session.start();
    expect(session.state).toBe("awaiting_answer");
    expect(session.awaiting?.answer).toBe("1/2");
    expect(spoken).toEqual(BEATS.slice(0, 3).map((b) => b.say));
    expect(boards).toEqual(["pie:8", "\\frac{3}{8}"]);
  });

  it("keeps a wrong answer's check open, says the hint, and moves on when right", async () => {
    const { s, spoken } = speaker();
    const session = new LiveSession({ brain: scriptedBrain(BEATS), speaker: s, lang: "en", title: "Fractions", now });
    await session.start();
    const wrong = await session.answer("1/4");
    expect(wrong.correct).toBe(false);
    expect(session.state).toBe("awaiting_answer");
    expect(spoken.at(-1)).toBe("Fewer, bigger slices.");
    const right = await session.answer(" 1/2 ");
    expect(right.correct).toBe(true);
    expect(session.state).toBe("done");
    expect(checkResults(session.record)).toEqual([{ question: "Which is bigger, 1/2 or 1/4?", attempts: ["1/4", " 1/2 "], correct: true }]);
    expect(session.record.endedAt).toBeDefined();
  });

  it("stops speaking on interrupt, answers, then carries on with the plan", async () => {
    const { s, spoken } = speaker([BEATS[1]!.say as string]);
    const brain = scriptedBrain(BEATS, (q) => ({ say: `You asked: ${q}. A whole is all eight slices.`, board: { kind: "text", content: "whole = 8/8" } }));
    const session = new LiveSession({ brain, speaker: s, lang: "en", title: "Fractions", now });
    const run = session.start();
    await when(session, (e) => e.type === "say" && e.beat === 1);
    await session.interrupt("what is a whole?");
    await run;
    expect(session.state).toBe("awaiting_answer");
    expect(spoken).toEqual([BEATS[0]!.say, BEATS[1]!.say, "You asked: what is a whole?. A whole is all eight slices.", BEATS[2]!.say]);
    const cut = session.record.entries.find((e) => e.kind === "say" && e.beat === 1);
    expect(cut).toMatchObject({ interrupted: true });
    expect(learnerQuestions(session.record)).toEqual(["what is a whole?"]);
    expect(boardHistory(session.record).map((b) => b.content)).toEqual(["pie:8", "\\frac{3}{8}", "whole = 8/8"]);
  });

  it("an interrupt during a check answers it and asks the check again", async () => {
    const { s } = speaker();
    const session = new LiveSession({ brain: scriptedBrain(BEATS), speaker: s, lang: "en", title: "Fractions", now });
    await session.start();
    const asked: string[] = [];
    session.on((e) => e.type === "check" && asked.push(e.check.question));
    await session.interrupt("can I have a hint?");
    expect(session.state).toBe("awaiting_answer");
    expect(asked).toEqual(["Which is bigger, 1/2 or 1/4?"]);
    expect((await session.answer("1/2")).correct).toBe(true);
  });

  it("a check cut off mid-sentence is still asked after the reply", async () => {
    const { s } = speaker([BEATS[2]!.say as string]);
    const session = new LiveSession({ brain: scriptedBrain(BEATS), speaker: s, lang: "en", title: "Fractions", now });
    const run = session.start();
    await when(session, (e) => e.type === "say" && e.beat === 2);
    await session.interrupt("wait, why?");
    await run;
    expect(session.state).toBe("awaiting_answer");
    expect(session.awaiting?.question).toBe("Which is bigger, 1/2 or 1/4?");
  });

  it("pause stops mid-beat and resume says that beat again", async () => {
    const line = BEATS[1]!.say as string;
    const hold = [line];
    const { s, spoken } = speaker(hold);
    const session = new LiveSession({ brain: scriptedBrain(BEATS), speaker: s, lang: "en", title: "Fractions", now });
    const run = session.start();
    await when(session, (e) => e.type === "say" && e.beat === 1);
    session.pause();
    await run;
    expect(session.state).toBe("paused");
    hold.length = 0;
    await session.resume();
    expect(session.state).toBe("awaiting_answer");
    expect(spoken.filter((t) => t === line)).toHaveLength(2);
    // Replayed, not re-added: the board for beat 1 shows once.
    expect(boardHistory(session.record)).toHaveLength(2);
    expect(session.record.beats).toHaveLength(3);
    const kinds = session.record.entries.map((e) => e.kind);
    expect(kinds).toContain("pause");
    expect(kinds).toContain("resume");
  });

  it("end() closes the record early", async () => {
    const { s } = speaker();
    const session = new LiveSession({ brain: scriptedBrain(BEATS), speaker: s, lang: "en", title: "Fractions", now });
    await session.start();
    session.end();
    expect(session.state).toBe("done");
    expect(session.record.entries.at(-1)).toMatchObject({ kind: "end", reason: "ended" });
    expect(transcript(session.record).map((t) => t.who)).toEqual(["tutor", "tutor", "tutor"]);
  });

  it("end() works after pausing and resuming at a check", async () => {
    const { s } = speaker();
    const session = new LiveSession({ brain: scriptedBrain(BEATS), speaker: s, lang: "en", title: "Fractions", now });
    await session.start();
    await session.answer("1/4");
    session.pause();
    await session.resume();
    expect(session.state).toBe("awaiting_answer");
    session.end();
    expect(session.state).toBe("done");
    expect(session.awaiting).toBeNull();
  });

  it("a saved record with an open check asks that check again", async () => {
    const brain = scriptedBrain(BEATS, () => ({ say: "A whole is all the slices." }));
    const first = new LiveSession({ brain, speaker: speaker().s, lang: "en", title: "Fractions", now });
    await first.start();
    await first.answer("1/4");
    await first.interrupt("what is a whole?");
    // The app reloads here: a new session gets the saved record and a fresh brain.
    const saved = JSON.parse(JSON.stringify(first.record));
    const asked: string[] = [];
    const again = new LiveSession({ brain: scriptedBrain(BEATS.slice(3)), speaker: speaker().s, lang: "en", title: "Fractions", now, record: saved });
    again.on((e) => e.type === "check" && asked.push(e.check.question));
    await again.start();
    expect(again.state).toBe("awaiting_answer");
    expect(asked).toEqual(["Which is bigger, 1/2 or 1/4?"]);
    expect((await again.answer("1/2")).correct).toBe(true);
    // Once answered right, a reload does not ask it again.
    const done = new LiveSession({ brain: scriptedBrain([]), speaker: speaker().s, lang: "en", title: "Fractions", now, record: JSON.parse(JSON.stringify(again.record)) });
    expect(done.awaiting).toBeNull();
  });

  it("reloading at an open check does not log the check twice", async () => {
    const first = new LiveSession({ brain: scriptedBrain(BEATS), speaker: speaker().s, lang: "en", title: "Fractions", now });
    await first.start();
    let rec = first.record;
    for (let n = 0; n < 2; n++) {
      const s = new LiveSession({ brain: scriptedBrain([]), speaker: speaker().s, lang: "en", title: "Fractions", now, record: JSON.parse(JSON.stringify(rec)) });
      await s.start();
      expect(s.awaiting?.answer).toBe("1/2");
      rec = s.record;
    }
    expect(rec.entries.filter((e) => e.kind === "check")).toHaveLength(1);
  });

  it("a beat paused mid-sentence is said again after a reload", async () => {
    const line = BEATS[1]!.say as string;
    const first = new LiveSession({ brain: scriptedBrain(BEATS), speaker: speaker([line]).s, lang: "en", title: "Fractions", now });
    const run = first.start();
    await when(first, (e) => e.type === "say" && e.beat === 1);
    first.pause();
    await run;
    const { s, spoken } = speaker();
    const again = new LiveSession({ brain: scriptedBrain(BEATS.slice(2)), speaker: s, lang: "en", title: "Fractions", now, record: JSON.parse(JSON.stringify(first.record)) });
    await again.start();
    expect(spoken).toEqual([line, BEATS[2]!.say]);
    expect(again.record.beats).toHaveLength(3);
    expect(boardHistory(again.record)).toHaveLength(2);
    expect(again.awaiting?.answer).toBe("1/2");
  });

  it("a paused reply at a check is said again, then the check is asked", async () => {
    const reply = "A whole is all the slices.";
    const first = new LiveSession({ brain: scriptedBrain(BEATS, () => ({ say: reply })), speaker: speaker([reply]).s, lang: "en", title: "Fractions", now });
    await first.start();
    const run = first.interrupt("what is a whole?");
    await when(first, (e) => e.type === "say" && e.text === reply);
    first.pause();
    await run;
    const { s, spoken } = speaker();
    const again = new LiveSession({ brain: scriptedBrain([]), speaker: s, lang: "en", title: "Fractions", now, record: JSON.parse(JSON.stringify(first.record)) });
    const asked: string[] = [];
    again.on((e) => e.type === "check" && asked.push(e.check.question));
    await again.start();
    expect(spoken).toEqual([reply]);
    expect(asked).toEqual(["Which is bigger, 1/2 or 1/4?"]);
    expect(again.state).toBe("awaiting_answer");
  });

  it("lessonNotes collects boards, questions with replies, and mistakes", () => {
    const check = { question: "Which is bigger, 1/2 or 1/4?", choices: ["1/2", "1/4"], answer: "1/2" };
    const rec: LessonRecord = {
      id: "r", lang: "en", title: "Fractions", startedAt: 0, beats: [],
      entries: [
        { at: 1, kind: "board", action: { kind: "math", content: "\frac{3}{8}" }, beat: 0 },
        { at: 2, kind: "board", action: { kind: "clear", content: "" }, beat: 1 },
        { at: 2, kind: "board", action: { kind: "slide", title: "Parts", content: "draft" }, beat: 1 },
        { at: 2, kind: "board", action: { kind: "slide", title: "Parts", content: "final" }, beat: 1 },
        { at: 3, kind: "question", text: "Why eighths?" },
        { at: 4, kind: "reply", text: "Because the pizza has eight slices." },
        { at: 5, kind: "question", text: "And sixths?" },
        { at: 6, kind: "check", check, beat: 2 },
        { at: 7, kind: "answer", beat: 2, answer: "1/4", correct: false, feedback: "Fewer, bigger slices." },
        { at: 8, kind: "check", check, beat: 2 },
        { at: 9, kind: "answer", beat: 2, answer: "1/2", correct: true, feedback: "" },
        { at: 10, kind: "check", check: { ...check, question: "Easy one" }, beat: 3 },
        { at: 11, kind: "answer", beat: 3, answer: "1/2", correct: true, feedback: "" },
      ],
    };
    const n = lessonNotes(rec);
    expect(n.boards.map((b) => b.content)).toEqual(["rac{3}{8}", "final"]);
    expect(n.questions).toEqual([{ question: "Why eighths?", reply: "Because the pizza has eight slices." }, { question: "And sixths?" }]);
    expect(n.mistakes).toEqual([{ question: check.question, wrong: ["1/4"], answer: "1/2", fixed: true, feedback: "Fewer, bigger slices." }]);
  });

  it("llmBrain asks the model for structured beats and grades free answers", async () => {
    const replies: unknown[] = [
      { done: false, beat: { say: "Let's start with what SQL is.", board: { kind: "slide", content: "SQL = asking a database" } } },
      { done: false, beat: { say: "Quick check.", check: { question: "What does SELECT do in your own words?", answer: "it picks the columns you want to read" } } },
      { correct: true, feedback: "Yes, it chooses what to read." },
      { done: true },
    ];
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text", text: JSON.stringify(replies.shift()) }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
        warnings: [],
      }),
    });
    const { s, spoken } = speaker();
    const session = new LiveSession({ brain: llmBrain({ teacher: model }, "en", { material: "SQL SELECT basics" }), speaker: s, lang: "en", title: "SQL", now });
    await session.start();
    expect(session.state).toBe("awaiting_answer");
    const g = await session.answer("it reads the columns I ask for");
    expect(g.correct).toBe(true);
    expect(spoken).toContain("Yes, it chooses what to read.");
    expect(session.state).toBe("done");
    expect(boardHistory(session.record)[0]?.kind).toBe("slide");
  });
});
