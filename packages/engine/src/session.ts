// Live session engine (decision 0002, L1). A session is a loop of beats: the tutor
// says something, may put something on the board, and may ask a check. The learner
// can interrupt, pause and resume. Everything lands in one lesson record, which
// later feeds Read mode, post-session notes and Review.
//
// The engine owns no audio and no UI: speech and the beat source are injected, so
// Chat, Voice and tests drive the same loop.
import { z } from "zod";
import { languageRule, structured, type Ctx } from "./llm.ts";
import type { Lang } from "./schema.ts";

export const BoardKind = z.enum(["text", "slide", "diagram", "chart", "math", "image", "animation", "lab", "clear"]);
export type BoardKind = z.infer<typeof BoardKind>;

export const BoardAction = z.object({
  kind: BoardKind,
  title: z.string().optional(),
  /** Kind-specific payload (markdown, mermaid source, chart rows, lab exercise id…). */
  content: z.string().default(""),
  /** Where a web or generated item came from; shown beside it (licensing is the learner's). */
  source: z.string().optional(),
});
export type BoardAction = z.infer<typeof BoardAction>;

export const Check = z.object({
  question: z.string().min(1),
  /** Empty means a free answer, graded by the brain. */
  choices: z.array(z.string()).default([]),
  answer: z.string().min(1),
  /** Said after a wrong answer. */
  hint: z.string().optional(),
});
export type Check = z.infer<typeof Check>;

export const Beat = z.object({
  say: z.string().min(1),
  board: BoardAction.optional(),
  check: Check.optional(),
});
export type Beat = z.input<typeof Beat>;
type ParsedBeat = z.infer<typeof Beat>;

export type SessionState = "idle" | "thinking" | "speaking" | "awaiting_answer" | "paused" | "done";

export type RecordEntry =
  | { at: number; kind: "say"; text: string; beat: number; interrupted?: boolean; paused?: boolean }
  | { at: number; kind: "board"; action: BoardAction; beat: number }
  | { at: number; kind: "check"; check: Check; beat: number }
  | { at: number; kind: "answer"; beat: number; answer: string; correct: boolean; feedback: string }
  | { at: number; kind: "question"; text: string }
  | { at: number; kind: "reply"; text: string }
  | { at: number; kind: "pause" }
  | { at: number; kind: "resume" }
  | { at: number; kind: "end"; reason: "finished" | "ended" };

export interface LessonRecord {
  id: string;
  lang: Lang;
  title: string;
  trackId?: string;
  objectiveId?: string;
  startedAt: number;
  endedAt?: number;
  /** Beats in the order they were played (replies to questions included). */
  beats: ParsedBeat[];
  entries: RecordEntry[];
}

export interface Grade {
  correct: boolean;
  feedback: string;
}

/** Where beats come from: a script (pack section), an LLM, or a test. */
export interface TutorBrain {
  /** The next teaching beat, or null when the section is finished. */
  nextBeat(rec: LessonRecord): Promise<Beat | null>;
  /** Answers a learner's interruption, then the session carries on. */
  reply(rec: LessonRecord, question: string): Promise<Beat>;
  /** Free-answer grading; choice checks are graded without it. */
  grade?(rec: LessonRecord, check: Check, answer: string): Promise<Grade>;
}

export interface Speaker {
  /** Resolves when the text has been spoken (or shown). Must stop when signal aborts. */
  speak(text: string, signal: AbortSignal): Promise<void>;
}

export type SessionEvent =
  | { type: "state"; state: SessionState }
  | { type: "say"; text: string; beat: number }
  | { type: "board"; action: BoardAction; beat: number }
  | { type: "check"; check: Check; beat: number }
  | { type: "graded"; correct: boolean; feedback: string; beat: number }
  | { type: "error"; error: unknown };

export interface SessionOptions {
  brain: TutorBrain;
  speaker: Speaker;
  lang: Lang;
  title: string;
  id?: string;
  trackId?: string;
  objectiveId?: string;
  now?: () => number;
  /** A record from an earlier run of this section; the session continues it. */
  record?: LessonRecord;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Choice checks and exact short answers are graded here, deterministically. */
export function gradeLocally(check: Check, answer: string): Grade | null {
  if (!check.choices.length && norm(check.answer).split(" ").length > 3) return null;
  const correct = norm(answer) === norm(check.answer);
  return { correct, feedback: correct ? "" : (check.hint ?? "") };
}

export class LiveSession {
  readonly record: LessonRecord;
  private _state: SessionState = "idle";
  private readonly brain: TutorBrain;
  private readonly speaker: Speaker;
  private readonly now: () => number;
  private readonly listeners = new Set<(e: SessionEvent) => void>();
  private readonly questions: string[] = [];
  private pumping: Promise<void> | null = null;
  private speech: AbortController | null = null;
  /** The check waiting for an answer, with the beat index it belongs to. */
  private pending: { check: Check; beat: number } | null = null;
  /** A beat cut off by pause; it is played again on resume. */
  private replay: { beat: ParsedBeat; index: number } | null = null;
  /** A beat cut off by a question; its check is still asked after the reply. `logged`: a reload already has it in the record. */
  private cutCheck: { check: Check; beat: number; logged?: boolean } | null = null;
  private pausedFlag = false;
  private endFlag = false;

  constructor(opts: SessionOptions) {
    this.brain = opts.brain;
    this.speaker = opts.speaker;
    this.now = opts.now ?? Date.now;
    this.record = opts.record ?? {
      id: opts.id ?? `live-${this.now().toString(36)}`,
      lang: opts.lang,
      title: opts.title,
      trackId: opts.trackId,
      objectiveId: opts.objectiveId,
      startedAt: this.now(),
      beats: [],
      entries: [],
    };
    if (opts.record && !opts.record.endedAt) {
      this.replay = pausedBeat(opts.record);
      const open = openCheck(opts.record);
      if (open && open.beat !== this.replay?.index) this.cutCheck = open;
    }
  }

  get state(): SessionState {
    return this._state;
  }

  /** The check the learner should answer now, if any. */
  get awaiting(): Check | null {
    return this.pending?.check ?? null;
  }

  on(fn: (e: SessionEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Starts (or continues) the session; resolves once it waits for the learner or ends. */
  start(): Promise<void> {
    if (this._state === "done") return Promise.resolve();
    return this.kick();
  }

  /** The learner answers the pending check. */
  async answer(text: string): Promise<Grade> {
    const p = this.pending;
    if (!p || this._state !== "awaiting_answer") throw new Error("No check is waiting for an answer.");
    this.pending = null;
    this.setState("thinking");
    let g: Grade;
    try {
      g = gradeLocally(p.check, text) ?? (this.brain.grade ? await this.brain.grade(this.record, p.check, text) : { correct: false, feedback: p.check.hint ?? "" });
    } catch (e) {
      this.pending = p;
      this.setState("awaiting_answer");
      throw e;
    }
    this.log({ kind: "answer", beat: p.beat, answer: text, correct: g.correct, feedback: g.feedback });
    this.emit({ type: "graded", correct: g.correct, feedback: g.feedback, beat: p.beat });
    if (g.feedback) {
      this.setState("speaking");
      await this.speakSafe(g.feedback);
    }
    // A wrong answer keeps the check open; the learner tries again or asks.
    if (!g.correct) {
      this.pending = p;
      this.setState("awaiting_answer");
      return g;
    }
    await this.kick();
    return g;
  }

  /** The learner cuts in with a question; the tutor stops talking and answers it. */
  interrupt(question: string): Promise<void> {
    if (this._state === "done") return Promise.resolve();
    this.questions.push(question);
    this.log({ kind: "question", text: question });
    if (this.pausedFlag) this.unpause();
    if (this.pending) {
      this.cutCheck = this.pending;
      this.pending = null;
    }
    this.speech?.abort("interrupt");
    return this.kick();
  }

  pause(): void {
    if (this._state === "done" || this.pausedFlag) return;
    this.pausedFlag = true;
    this.log({ kind: "pause" });
    this.speech?.abort("pause");
    if (!this.pumping) this.setState("paused");
  }

  resume(): Promise<void> {
    if (!this.pausedFlag) return this.kick();
    this.unpause();
    return this.kick();
  }

  /** Ends the session early; the record is kept as it stands. */
  end(): void {
    if (this._state === "done") return;
    this.endFlag = true;
    this.speech?.abort("end");
    if (!this.pumping) this.finish("ended");
  }

  /** Waits until the loop is idle (waiting for the learner, paused or done). */
  settled(): Promise<void> {
    return this.pumping ?? Promise.resolve();
  }

  private unpause() {
    this.pausedFlag = false;
    this.log({ kind: "resume" });
    if (this.pending) this.setState("awaiting_answer");
  }

  private kick(): Promise<void> {
    // pump() can finish synchronously, so clear the handle after assigning it.
    if (!this.pumping) {
      const p: Promise<void> = this.pump().finally(() => {
        if (this.pumping === p) this.pumping = null;
      });
      this.pumping = p;
    }
    return this.pumping;
  }

  private async pump(): Promise<void> {
    try {
      for (;;) {
        if (this.endFlag) return this.finish("ended");
        if (this.pausedFlag) return this.setState("paused");
        const q = this.questions.shift();
        if (q !== undefined) {
          this.setState("thinking");
          const beat = Beat.parse(await this.brain.reply(this.record, q));
          this.log({ kind: "reply", text: beat.say });
          await this.play(beat);
          continue;
        }
        if (this.pending) return this.setState("awaiting_answer");
        // A paused beat goes first: it may be the reply that came before an open check.
        const again = this.replay;
        this.replay = null;
        if (!again && this.cutCheck) {
          const { check, beat: at, logged } = this.cutCheck;
          this.pending = { check, beat: at };
          this.cutCheck = null;
          this.speakCheck(check, at, !logged);
          continue;
        }
        let beat: ParsedBeat | null;
        if (again) beat = again.beat;
        else {
          this.setState("thinking");
          const raw = await this.brain.nextBeat(this.record);
          beat = raw ? Beat.parse(raw) : null;
        }
        if (!beat) return this.finish("finished");
        await this.play(beat, again?.index);
      }
    } catch (e) {
      this.emit({ type: "error", error: e });
      this.setState(this.pending ? "awaiting_answer" : "idle");
    }
  }

  /** Board first, then speech, then the check (if speech was not cut off). */
  private async play(beat: ParsedBeat, replayIndex?: number): Promise<void> {
    const index = replayIndex ?? this.record.beats.push(beat) - 1;
    if (beat.board && replayIndex === undefined) {
      this.log({ kind: "board", action: beat.board, beat: index });
      this.emit({ type: "board", action: beat.board, beat: index });
    }
    this.setState("speaking");
    this.emit({ type: "say", text: beat.say, beat: index });
    const cut = await this.speakSafe(beat.say);
    this.log({ kind: "say", text: beat.say, beat: index, ...(cut ? { interrupted: true } : {}), ...(cut === "pause" ? { paused: true } : {}) });
    if (cut === "pause") {
      this.replay = { beat, index };
      return;
    }
    if (beat.check) {
      if (cut) this.cutCheck = { check: beat.check, beat: index };
      else {
        this.pending = { check: beat.check, beat: index };
        this.speakCheck(beat.check, index);
      }
    }
  }

  private speakCheck(check: Check, beat: number, log = true) {
    if (log) this.log({ kind: "check", check, beat });
    this.emit({ type: "check", check, beat });
  }

  /** Returns why speech was cut off, or null when it finished. */
  private async speakSafe(text: string): Promise<string | null> {
    const ac = new AbortController();
    this.speech = ac;
    try {
      await this.speaker.speak(text, ac.signal);
    } catch (e) {
      if (!ac.signal.aborted) throw e;
    } finally {
      if (this.speech === ac) this.speech = null;
    }
    return ac.signal.aborted ? String(ac.signal.reason ?? "interrupt") : null;
  }

  private finish(reason: "finished" | "ended") {
    this.pending = this.cutCheck = null;
    this.record.endedAt = this.now();
    this.log({ kind: "end", reason });
    this.setState("done");
  }

  private log(e: RecordEntry extends infer T ? (T extends RecordEntry ? Omit<T, "at"> : never) : never) {
    this.record.entries.push({ at: this.now(), ...e } as RecordEntry);
  }

  private setState(s: SessionState) {
    if (s === this._state) return;
    this._state = s;
    this.emit({ type: "state", state: s });
  }

  private emit(e: SessionEvent) {
    for (const fn of this.listeners) fn(e);
  }
}

/**
 * The check a saved record left unanswered, so a reload asks it again. That is the
 * last beat with a check, when it has no right answer and only replies came after it.
 */
function openCheck(r: LessonRecord): { check: Check; beat: number; logged: boolean } | null {
  let i = r.beats.length - 1;
  while (i >= 0 && !r.beats[i]!.check) i--;
  const check = r.beats[i]?.check;
  if (!check) return null;
  if (r.entries.some((e) => e.kind === "answer" && e.beat === i && e.correct)) return null;
  const replies = new Set(r.entries.flatMap((e) => (e.kind === "reply" ? [e.text] : [])));
  if (r.beats.slice(i + 1).some((b) => !replies.has(b.say))) return null;
  return { check, beat: i, logged: r.entries.some((e) => e.kind === "check" && e.beat === i) };
}

/** The last beat, when pause cut it off and it was not played again; a reload says it again. */
function pausedBeat(r: LessonRecord): { beat: ParsedBeat; index: number } | null {
  const index = r.beats.length - 1;
  for (let i = r.entries.length - 1; i >= 0; i--) {
    const e = r.entries[i]!;
    if (e.kind === "say" && e.beat === index) return e.paused ? { beat: r.beats[index]!, index } : null;
  }
  return null;
}

// ---- Reading the record (Read mode, notes, Review) ----

export function boardHistory(rec: LessonRecord): BoardAction[] {
  return rec.entries.flatMap((e) => (e.kind === "board" && e.action.kind !== "clear" ? [e.action] : []));
}

export function learnerQuestions(rec: LessonRecord): string[] {
  return rec.entries.flatMap((e) => (e.kind === "question" ? [e.text] : []));
}

export interface CheckResult {
  question: string;
  attempts: string[];
  correct: boolean;
}

/** One row per check asked, with every attempt; a mistake is a check with a wrong attempt. */
export function checkResults(rec: LessonRecord): CheckResult[] {
  const byBeat = new Map<number, CheckResult>();
  for (const e of rec.entries) {
    if (e.kind === "check" && !byBeat.has(e.beat)) byBeat.set(e.beat, { question: e.check.question, attempts: [], correct: false });
    if (e.kind === "answer") {
      const r = byBeat.get(e.beat);
      if (!r) continue;
      r.attempts.push(e.answer);
      r.correct ||= e.correct;
    }
  }
  return [...byBeat.values()];
}

/** The spoken part of the session as plain text, in order. */
export interface LessonNotes {
  /** Everything put on the board, in order (clears left out). */
  boards: BoardAction[];
  /** The learner's own questions, each with the tutor's reply when there was one. */
  questions: { question: string; reply?: string }[];
  /** Checks answered wrong at least once: the wrong answers, the right answer, and the last feedback. */
  mistakes: { question: string; wrong: string[]; answer: string; fixed: boolean; feedback?: string }[];
}

/** Notes for Read mode, rebuilt from the lesson record after a live session. */
export function lessonNotes(rec: LessonRecord): LessonNotes {
  const questions: LessonNotes["questions"] = [];
  const checks = new Map<number, Check>();
  const byBeat = new Map<number, LessonNotes["mistakes"][number]>();
  for (const e of rec.entries) {
    if (e.kind === "question") questions.push({ question: e.text });
    else if (e.kind === "reply" && questions.length && questions.at(-1)!.reply === undefined) questions.at(-1)!.reply = e.text;
    else if (e.kind === "check" && !checks.has(e.beat)) checks.set(e.beat, e.check);
    else if (e.kind === "answer") {
      const check = checks.get(e.beat);
      if (!check) continue;
      const m = byBeat.get(e.beat);
      if (e.correct) {
        if (m) m.fixed = true;
      } else if (m) {
        m.wrong.push(e.answer);
        m.feedback = e.feedback || m.feedback;
      } else byBeat.set(e.beat, { question: check.question, wrong: [e.answer], answer: check.answer, fixed: false, ...(e.feedback ? { feedback: e.feedback } : {}) });
    }
  }
  // A board redrawn under the same title replaces the one before it, so only the last version is kept.
  const all = boardHistory(rec);
  const boards = all.filter((b, i) => !b.title || all[i + 1]?.title !== b.title);
  return { boards, questions, mistakes: [...byBeat.values()] };
}

export function transcript(rec: LessonRecord): { who: "tutor" | "learner"; text: string }[] {
  return rec.entries.flatMap((e): { who: "tutor" | "learner"; text: string }[] =>
    e.kind === "say" ? [{ who: "tutor", text: e.text }]
    : e.kind === "question" ? [{ who: "learner", text: e.text }]
    : e.kind === "answer" ? [{ who: "learner", text: e.answer }]
    : [],
  );
}

// ---- Brains ----

/** Plays fixed beats in order (a pack section, or a test). Replies come from `reply`. */
export function scriptedBrain(beats: Beat[], reply: (q: string) => Beat | Promise<Beat> = () => ({ say: "Good question — let's keep going." })): TutorBrain {
  let i = 0;
  return {
    nextBeat: async () => beats[i++] ?? null,
    reply: async (_rec, q) => reply(q),
  };
}

export interface LlmBrainOptions {
  /** What this section teaches: objective title, summary, lesson text or resources. */
  material: string;
  /** Persona line, e.g. from settings. */
  teacher?: string;
  /** Stop after this many teaching beats (replies not counted). */
  maxBeats?: number;
  /** What the tutor knows about the learner (memoryText), read at session start. */
  learner?: string;
}

const NextBeat = z.object({
  done: z.boolean().describe("true when the section has been fully taught and checked"),
  beat: Beat.optional(),
});

function recap(rec: LessonRecord): string {
  return transcript(rec)
    .slice(-16)
    .map((t) => `${t.who === "tutor" ? "Tutor" : "Learner"}: ${t.text}`)
    .join("\n");
}

/** How each board kind's `content` is written, so the UI can render it. */
export const BOARD_FORMATS =
  "Board content by kind: text and slide are short markdown; diagram is Mermaid source; math is LaTeX without $ signs; chart is JSON {\"kind\":\"bar\"|\"line\",\"labels\":[...],\"series\":[{\"name\":\"...\",\"values\":[...]}]}; image is a data:image URI or inline <svg> source (web links are not shown); animation is markdown frames separated by lines holding only ---, shown one after another; lab is JSON {\"language\":\"python\"|\"sql\",\"code\":\"...\"} the learner can run; clear empties the board. Use only these kinds.";

/** The tutor leads with an LLM: one structured beat per call. */
export function llmBrain(ctx: Ctx, lang: Lang, opts: LlmBrainOptions): TutorBrain {
  const system = `${opts.teacher ?? "You are a patient, lively tutor who leads a live lesson."} Teach one small step per beat: say one to three short spoken sentences (no markdown, no lists), optionally put something on the board, and every few beats ask a short check. Prefer choice checks. ${BOARD_FORMATS} ${languageRule(lang)}${opts.learner ? `

What you know about this learner (use it to teach them better; do not recite it):
${opts.learner}` : ""}`;
  let taught = 0;
  return {
    async nextBeat(rec) {
      if (opts.maxBeats !== undefined && taught >= opts.maxBeats) return null;
      const r = await structured(ctx, "teacher", "live beat", NextBeat, system, `Material:\n${opts.material}\n\nSo far:\n${recap(rec) || "(nothing yet — open the lesson)"}\n\nGive the next beat, or done=true if finished.`);
      if (r.done || !r.beat) return null;
      taught++;
      return r.beat;
    },
    async reply(rec, q) {
      return structured(ctx, "teacher", "live reply", Beat, system, `Material:\n${opts.material}\n\nSo far:\n${recap(rec)}\n\nThe learner just interrupted: "${q}". Answer it briefly as one beat, then the lesson goes on.`);
    },
    async grade(_rec, check, answer) {
      return structured(
        ctx,
        "grader",
        "live check",
        z.object({ correct: z.boolean(), feedback: z.string() }),
        `Grade a learner's short answer kindly. Feedback is one spoken sentence. ${languageRule(lang)}`,
        `Question: ${check.question}\nExpected: ${check.answer}\nLearner: ${answer}`,
      );
    },
  };
}
