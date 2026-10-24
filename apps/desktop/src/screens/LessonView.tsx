// One lesson. Blocks are revealed in order and every gate (check, exercise,
// reflect) must be answered before the next part shows.
import { useEffect, useRef, useState } from "react";
import { generateLesson, lessonNotes, lessonPlainText, nextObjective, tutorAgentReply, type Block, type EvidenceKind, type Lang, type Lesson, type LessonNotes, type Plan } from "@kuttab/engine";
import { useT } from "../i18n.ts";
import { planLang, refreshCounters, services, useStore } from "../state.ts";
import { errorText, makeCtx, stepHits, teacherName, toolHost, tutorTools } from "../ai.ts";
import { BlockView, blockId, isGate } from "../components/BlockView.tsx";
import { Card, ErrorBox, MicButton, Spinner } from "../components/common.tsx";
import { Markdown } from "../markdown.tsx";
import { Widget, type WidgetPart } from "../components/Widgets.tsx";
import { BoardItem } from "../components/Board.tsx";

/** Board kinds whose renderer already shows the title. */
const TITLED = new Set(["slide", "diagram", "chart"]);
const KIND: Partial<Record<Block["type"], EvidenceKind>> = { check: "check", exercise: "exercise", reflect: "reflect" };

export function LessonView({ planId, objectiveId }: { planId: string; objectiveId: string }) {
  const t = useT();
  const go = useStore((s) => s.go);
  const [plan, setPlan] = useState<Plan>();
  const [lesson, setLesson] = useState<Lesson>();
  const [err, setErr] = useState<unknown>();
  const [shown, setShown] = useState(1);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [next, setNext] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [notes, setNotes] = useState<LessonNotes>();

  // The notes are rebuilt from the saved live record each time the page opens.
  useEffect(() => {
    let live = true;
    setNotes(undefined);
    void services()
      .course.liveRecord(planId, objectiveId)
      .then((rec) => {
        if (!live || !rec) return;
        const n = lessonNotes(rec);
        if (n.boards.length || n.questions.length || n.mistakes.length) setNotes(n);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [planId, objectiveId]);

  useEffect(() => {
    let live = true;
    setLesson(undefined);
    setErr(undefined);
    setShown(1);
    setCompleted(new Set());
    setNext(undefined);
    void (async () => {
      const { course, labs } = services();
      const p = await course.plan(planId);
      if (!p) throw new Error("Course not found");
      const objective = p.items.find((x) => x.id === objectiveId);
      if (!objective) throw new Error("Step not found");
      if (live) setPlan(p);
      const lang = planLang(p);
      const l = await course.lessonOrGenerate(planId, objectiveId, async () => {
        const ctx = await makeCtx();
        const profile = { ...(useStore.getState().profile ?? { goal: "", level: "new" as const, minutesPerDay: 20, style: "examples-first" as const }), lang };
        const hits = await stepHits(planId, objective);
        return generateLesson(ctx, { planId, objective, profile, lang, hits, labs, modelName: teacherName() });
      });
      if (live) setLesson(l);
    })().catch((e) => live && setErr(e));
    return () => {
      live = false;
    };
  }, [planId, objectiveId, attempt]);

  if (err !== undefined)
    return (
      <main className="lesson">
        <BackLink planId={planId} />
        <ErrorBox error={err} onRetry={() => setAttempt((a) => a + 1)} />
      </main>
    );
  if (!lesson || !plan)
    return (
      <main className="lesson">
        <BackLink planId={planId} />
        <Spinner label={t("generating")} />
      </main>
    );

  const lang: Lang = lesson.lang;
  const blocks = lesson.blocks;
  const visible = blocks.slice(0, shown);
  const last = visible.length - 1;
  const lastBlock = blocks[last];
  const waiting = lastBlock && isGate(lastBlock) && !completed.has(last);
  const finished = shown >= blocks.length && !waiting;

  const onResult = (b: Block) => async (correct: boolean) => {
    const kind = KIND[b.type];
    if (!kind) return;
    const m = await services().course.record(planId, objectiveId, kind, correct, blockId(b));
    await refreshCounters();
    if (shown >= blocks.length) setNext(nextObjective(plan, m)?.id);
  };
  const onComplete = (i: number) => () => {
    setCompleted((s) => new Set(s).add(i));
    if (i === shown - 1 && shown < blocks.length) setShown((n) => n + 1);
  };

  return (
    <main className="lesson" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <BackLink planId={planId} />
      <div className="row">
        <h1 dir="auto">{lesson.title}</h1>
        {lesson.generatedBy !== "author" && (
          <button
            className="link"
            onClick={async () => {
              if (!confirm(t("regenerate") + "?")) return;
              await services().course.dropLesson(planId, objectiveId);
              setAttempt((a) => a + 1);
            }}
          >
            ↻ {t("regenerate")}
          </button>
        )}
        <button className="link" onClick={() => go({ name: "live", planId, objectiveId })}>
          🎙 {t("liveStart")}
        </button>
      </div>

      {notes && <LiveNotes notes={notes} />}

      {visible.map((b, i) => (
        <BlockView key={`${attempt}-${i}`} block={b} lang={lang} onResult={onResult(b)} onComplete={onComplete(i)} />
      ))}

      {!waiting && !finished && (
        <button className="primary" onClick={() => setShown((n) => n + 1)}>
          {t("continueLesson")}
        </button>
      )}

      {finished && <Finished planId={planId} plan={plan} nextId={next} onLoaded={setNext} />}

      {!!lesson.citations?.length && (
        <Card className="citations">
          <h3>{t("citations")}</h3>
          <ol className="plain">
            {lesson.citations.map((c) => (
              <li key={c.n} dir="auto">
                [{c.n}] {c.title}
                {c.locator ? ` — ${c.locator}` : ""}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Tutor lesson={lesson} />
      {!finished && (
        <button className="link" onClick={() => go({ name: "plan", planId })}>
          {t("backToPlan")}
        </button>
      )}
    </main>
  );
}

/** What the learner keeps from the live session: the boards, their questions, and the checks they missed. */
function LiveNotes({ notes }: { notes: LessonNotes }) {
  const t = useT();
  return (
    <Card className="live-notes">
      <details open>
        <summary>
          <h3>{t("liveNotes")}</h3>
        </summary>
        {!!notes.boards.length && (
          <section>
            <h4>{t("notesBoards")}</h4>
            {notes.boards.map((b, i) => (
              <div key={i} className="notes-board">
                {b.title && !TITLED.has(b.kind) && <h5 dir="auto">{b.title}</h5>}
                <BoardItem action={b} />
              </div>
            ))}
          </section>
        )}
        {!!notes.questions.length && (
          <section>
            <h4>{t("yourQuestions")}</h4>
            <ul className="plain notes-qa">
              {notes.questions.map((q, i) => (
                <li key={i}>
                  <p dir="auto">
                    <strong>{q.question}</strong>
                  </p>
                  {q.reply && <Markdown text={q.reply} />}
                </li>
              ))}
            </ul>
          </section>
        )}
        {!!notes.mistakes.length && (
          <section>
            <h4>{t("mistakes")}</h4>
            <ul className="plain notes-qa">
              {notes.mistakes.map((m, i) => (
                <li key={i}>
                  <p dir="auto">
                    <strong>{m.question}</strong>
                  </p>
                  <p className="err" dir="auto">
                    ✗ {t("youAnswered")}: {m.wrong.join(" · ")}
                  </p>
                  <p className="ok" dir="auto">
                    ✓ {t("rightAnswer")}: {m.answer}
                  </p>
                  {m.feedback && (
                    <p className="muted" dir="auto">
                      {m.feedback}
                    </p>
                  )}
                  {m.fixed && <p className="muted">{t("fixedLater")}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </details>
    </Card>
  );
}

function BackLink({ planId }: { planId: string }) {
  const t = useT();
  const go = useStore((s) => s.go);
  return (
    <button className="link" onClick={() => go({ name: "plan", planId })}>
      ← {t("plan")}
    </button>
  );
}

function Finished({ planId, plan, nextId, onLoaded }: { planId: string; plan: Plan; nextId?: string; onLoaded: (id?: string) => void }) {
  const t = useT();
  const go = useStore((s) => s.go);
  useEffect(() => {
    void services()
      .course.mastery(planId)
      .then((m) => onLoaded(nextObjective(plan, m)?.id));
    // Run once when the lesson ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card className="done">
      <h2>🎉 {t("lessonDone")}</h2>
      <div className="row">
        {nextId ? (
          <button className="primary" onClick={() => go({ name: "lesson", planId, objectiveId: nextId })}>
            {t("nextLesson")}
          </button>
        ) : (
          <p className="ok">{t("allDone")}</p>
        )}
        <button onClick={() => go({ name: "plan", planId })}>{t("backToPlan")}</button>
      </div>
    </Card>
  );
}

type Part = { kind: "text"; text: string } | ({ kind: "widget" } & WidgetPart);

interface Msg {
  role: "user" | "tutor";
  parts: Part[];
}

/** What the model sees of a message: its text, with each widget named in brackets. */
function msgText(m: Msg): string {
  return m.parts
    .map((p) => (p.kind === "text" ? p.text : `[${p.name}: ${(p.input as { title?: string; question?: string })?.title ?? (p.input as { question?: string })?.question ?? ""}]`))
    .join("");
}

function Tutor({ lesson }: { lesson: Lesson }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  if (!open)
    return (
      <button onClick={() => setOpen(true)}>
        💬 {t("askTutor")}
      </button>
    );

  const addPart = (part: Part) =>
    setMsgs((ms) => {
      const copy = [...ms];
      const last = copy[copy.length - 1];
      const parts = [...last.parts];
      const tail = parts[parts.length - 1];
      if (part.kind === "text" && tail?.kind === "text") parts[parts.length - 1] = { kind: "text", text: tail.text + part.text };
      else parts.push(part);
      copy[copy.length - 1] = { ...last, parts };
      return copy;
    });

  const send = async (text?: string) => {
    const q = (text ?? draft).trim();
    if (!q || busy) return;
    const history: Msg[] = [...msgs, { role: "user", parts: [{ kind: "text", text: q }] }];
    setMsgs([...history, { role: "tutor", parts: [] }]);
    if (text === undefined) setDraft("");
    setBusy(true);
    setErr(undefined);
    abort.current = new AbortController();
    const convo = history.map((m) => ({ role: m.role, text: msgText(m) }));
    let produced = false;
    const stream = async (tools: ReturnType<typeof tutorTools>) => {
      const ctx = await makeCtx(abort.current!.signal);
      for await (const ev of tutorAgentReply(ctx, lesson.title, lessonPlainText(lesson), convo, lesson.lang, { tools, host: toolHost() })) {
        if (ev.type === "text") addPart({ kind: "text", text: ev.text });
        else if (ev.type === "widget") addPart({ kind: "widget", name: ev.name, input: ev.input });
        else continue;
        produced = true;
      }
    };
    try {
      const tools = tutorTools();
      try {
        await stream(tools);
      } catch (e) {
        // Some providers reject tool definitions outright; answer in plain chat instead.
        if (produced || !tools.length || abort.current.signal.aborted) throw e;
        await stream([]);
      }
    } catch (e) {
      setErr(errorText(e));
      setMsgs((ms) => (ms[ms.length - 1]?.parts.length ? ms : ms.slice(0, -1)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="tutor">
      <h3>💬 {t("askTutor")}</h3>
      <div className="chat">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.parts.length ? (
              m.parts.map((p, j) => (p.kind === "text" ? <Markdown key={j} text={p.text} /> : <Widget key={j} part={p} onAnswer={(a) => void send(a)} />))
            ) : (
              <Spinner label={t("thinking")} />
            )}
          </div>
        ))}
      </div>
      {err && <div className="error">{err === "no-model" ? t("needsModel") : err}</div>}
      <form
        className="answer-row"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("tutorPh")} dir="auto" disabled={busy} />
        <MicButton lang={lesson.lang} onText={(s) => setDraft((d) => (d ? `${d} ${s}` : s))} />
        <button className="primary" type="submit" disabled={busy || !draft.trim()}>
          {t("send")}
        </button>
      </form>
    </Card>
  );
}
