// Live lesson, Chat mode: the tutor leads, speaks each sentence as it goes, and
// draws on a board with history. Built on the engine's LiveSession.
import { useEffect, useRef, useState } from "react";
import { LiveSession, boardHistory, lessonPlainText, llmBrain, type Lang, type Plan, type SessionState, type Speaker } from "@kuttab/engine";
import { useT, type StrKey } from "../i18n.ts";
import { planLang, refreshCounters, services, useStore } from "../state.ts";
import { kbEmbed, makeCtx } from "../ai.ts";
import { Card, ErrorBox, MicButton, Spinner } from "../components/common.tsx";
import { BoardItem } from "../components/Board.tsx";
import { WHISPER_SIZE_MB, canSpeak, sentences, speakAsync, startRecording, stopSpeaking, transcribe, whisperCached, type Recorder } from "../speech.ts";

type Mode = "chat" | "voice";

const STATE_LABEL: Partial<Record<SessionState, StrKey>> = { speaking: "stTalking", thinking: "stThinking", awaiting_answer: "stWaiting", paused: "stPaused" };

/** Waits roughly as long as reading the text takes, or until aborted. */
function readPause(text: string, signal: AbortSignal): Promise<void> {
  const ms = Math.min(400 + 40 * text.split(/\s+/).length, 6000);
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(id), resolve()), { once: true });
  });
}

export function LiveView({ planId, objectiveId }: { planId: string; objectiveId: string }) {
  const t = useT();
  const go = useStore((s) => s.go);
  const tts = useStore((s) => s.settings.tts);
  const [plan, setPlan] = useState<Plan>();
  const [session, setSession] = useState<LiveSession>();
  const [err, setErr] = useState<unknown>();
  const [attempt, setAttempt] = useState(0);
  const [, setTick] = useState(0);
  const [current, setCurrent] = useState<{ text: string; beat: number }>();
  const [sentence, setSentence] = useState(-1);
  const [picked, setPicked] = useState<number>();
  const [input, setInput] = useState("");
  const [readAloud, setReadAloud] = useState(tts && canSpeak());
  const [mode, setMode] = useState<Mode>("chat");
  const readRef = useRef(readAloud);
  // Voice mode always speaks; the checkbox only governs Chat mode.
  readRef.current = readAloud || mode === "voice";
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const abort = new AbortController();
    let s: LiveSession | undefined;
    setErr(undefined);
    setSession(undefined);
    void (async () => {
      const { course, kb } = services();
      const p = await course.plan(planId);
      if (!p) throw new Error("Course not found");
      const objective = p.items.find((x) => x.id === objectiveId);
      if (!objective) throw new Error("Step not found");
      if (!live) return;
      setPlan(p);
      const lang = planLang(p);
      const lesson = await course.lesson(planId, objectiveId);
      const hits = kb.size ? await kb.search(`${objective.title} ${objective.summary}`, 5, await kbEmbed()) : [];
      const material = [
        `${objective.title}\n${objective.summary}`,
        lesson ? lessonPlainText(lesson) : "",
        ...hits.map((h) => `[${h.source.title}] ${h.chunk.text}`),
      ].filter(Boolean).join("\n\n");
      const brain = llmBrain(await makeCtx(abort.signal), lang, { material });
      const speaker: Speaker = {
        async speak(text, signal) {
          const parts = sentences(text);
          for (let i = 0; i < parts.length && !signal.aborted; i++) {
            setSentence(i);
            await (readRef.current ? speakAsync(parts[i]!, lang, signal) : readPause(parts[i]!, signal));
          }
          setSentence(-1);
        },
      };
      const saved = await course.liveRecord(planId, objectiveId);
      if (!live) return;
      s = new LiveSession({ brain, speaker, lang, title: objective.title, objectiveId, trackId: planId, record: saved && !saved.endedAt ? saved : undefined });
      s.on((e) => {
        if (e.type === "say") setCurrent({ text: e.text, beat: e.beat });
        if (e.type === "board") setPicked(undefined);
        if (e.type === "graded") void course.record(planId, objectiveId, "check", e.correct).then(refreshCounters);
        if (e.type === "error") setErr(e.error);
        if (e.type === "state") void course.saveLiveRecord(planId, objectiveId, s!.record);
        setTick((n) => n + 1);
      });
      setSession(s);
      await s.start();
    })().catch((e) => live && setErr(e));
    return () => {
      live = false;
      abort.abort();
      if (s) {
        // Leaving (to Read mode, the plan, or another page) pauses; only End closes the session, so its notes are kept.
        if (s.state !== "done") s.pause();
        void services().course.saveLiveRecord(planId, objectiveId, s.record);
      }
      stopSpeaking();
    };
  }, [planId, objectiveId, attempt]);

  useEffect(() => {
    if (!readRef.current) stopSpeaking();
  }, [readAloud, mode]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  });

  const lang: Lang = planLang(plan);
  const state = session?.state ?? "idle";
  const check = session?.awaiting ?? null;
  const entries = session?.record.entries ?? [];
  const boards = session ? boardHistory(session.record) : [];
  const shown = picked ?? boards.length - 1;
  const lastSay = [...entries].reverse().find((e) => e.kind === "say");
  const pendingSay = current && !(lastSay?.kind === "say" && lastSay.text === current.text && lastSay.beat === current.beat) ? current : undefined;

  // Typed text answers a waiting check; anything else is a question that cuts in.
  const send = (text: string, asQuestion = false) => {
    const q = text.trim();
    if (!session || !q || state === "done") return;
    setInput("");
    setErr(undefined);
    if (session.awaiting && !asQuestion) void session.answer(q).catch(setErr);
    else void session.interrupt(q).catch(setErr);
  };

  const spoken = (text: string, isNow: boolean) =>
    isNow && sentence >= 0 ? sentences(text).map((s, i) => <span key={i} className={i === sentence ? "live-now" : undefined}>{s} </span>) : text;

  return (
    <main className="live" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <header className="live-head">
        <button className="link" onClick={() => go({ name: "plan", planId })}>
          ← {t("plan")}
        </button>
        {plan && (
          <ol className="live-steps">
            {plan.items.map((it) => (
              <li key={it.id} className={`live-step ${it.id === objectiveId ? "now" : ""}`}>
                {it.title}
              </li>
            ))}
          </ol>
        )}
        {STATE_LABEL[state] && <span className="badge live-state">{t(STATE_LABEL[state]!)}</span>}
        <div className="seg live-mode" role="group">
          {(["chat", "voice"] as const).map((m) => (
            <button key={m} className={mode === m ? "on" : undefined} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {t(m === "chat" ? "chatMode" : "voiceMode")}
            </button>
          ))}
        </div>
        <button className="link" onClick={() => go({ name: "lesson", planId, objectiveId })}>
          📖 {t("readMode")}
        </button>
      </header>

      <div className="live-split">
        <section className="live-tutor">
          {mode === "voice" && session && state !== "done" ? (
            <VoicePanel
              session={session}
              state={state}
              lang={lang}
              caption={pendingSay && state === "speaking" ? (sentences(pendingSay.text)[sentence] ?? pendingSay.text) : (check?.question ?? lastSay?.text ?? "")}
              choices={check?.choices ?? []}
              onChoice={send}
              onError={setErr}
            />
          ) : (
          <div className="live-chat" aria-live="polite">
            {!session && !err && <Spinner label={t("stThinking")} />}
            {entries.map((e, i) => {
              if (e.kind === "say")
                return (
                  <div key={i} className="live-msg ai" dir="auto">
                    {e.text}
                  </div>
                );
              if (e.kind === "question")
                return (
                  <div key={i} className="live-msg me" dir="auto">
                    {e.text}
                  </div>
                );
              if (e.kind === "answer")
                return (
                  <div key={i}>
                    <div className="live-msg me" dir="auto">
                      {e.answer}
                    </div>
                    <div className={`live-note ${e.correct ? "ok" : "bad"}`} dir="auto">
                      {e.correct ? "✓ " : "✗ "}
                      {e.feedback || t(e.correct ? "correct" : "notQuite")}
                    </div>
                  </div>
                );
              if (e.kind === "end")
                return (
                  <div key={i} className="live-note">
                    {e.reason === "ended" ? t("liveEnded") : t("liveDone")}
                  </div>
                );
              return null;
            })}
            {pendingSay && (
              <div className={`live-msg ai ${state === "speaking" ? "speaking" : ""}`} dir="auto">
                {spoken(pendingSay.text, state === "speaking")}
              </div>
            )}
            {check && (
              <div className="live-msg ai live-check" dir="auto">
                <strong>{check.question}</strong>
                {check.choices.length > 0 && (
                  <div className="live-choices">
                    {check.choices.map((c) => (
                      <button key={c} onClick={() => send(c)} dir="auto">
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {state === "thinking" && session && <div className="live-note">…</div>}
            <div ref={chatEnd} />
          </div>
          )}

          {err !== undefined && <ErrorBox error={err} onRetry={session ? undefined : () => setAttempt((a) => a + 1)} />}

          {state === "done" ? (
            <Card>
              <strong>{t("liveDone")}</strong>
              <div className="row">
                <button className="primary" onClick={() => go({ name: "lesson", planId, objectiveId })}>
                  📖 {t("liveNotes")}
                </button>
                <button onClick={() => go({ name: "plan", planId })}>{t("backToPlan")}</button>
              </div>
            </Card>
          ) : (
            <>
              <div className="live-quick">
                {state === "paused" ? (
                  <button onClick={() => void session?.resume().catch(setErr)}>▶ {t("resumeLive")}</button>
                ) : (
                  <button disabled={!session || state === "idle"} onClick={() => session?.pause()}>
                    ⏸ {t("pauseLive")}
                  </button>
                )}
                <button disabled={!session} onClick={() => send(t("explainAgainQ"), true)}>
                  ↺ {t("explainAgain")}
                </button>
                <button disabled={!session} onClick={() => session?.end()}>
                  ■ {t("endLive")}
                </button>
              </div>
              {mode === "chat" && (
              <form
                className="live-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
              >
                <MicButton lang={lang} onText={(s) => setInput((v) => (v ? `${v} ${s}` : s))} />
                <input dir="auto" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t(check ? "answerPh" : "livePh")} disabled={!session} />
                <button className="primary" type="submit" disabled={!session || !input.trim()}>
                  {t("send")}
                </button>
              </form>
              )}
            </>
          )}
        </section>

        <section className="live-board">
          <div className="live-boardbar">
            <strong>{boards[shown]?.title ?? t("board")}</strong>
            {mode === "chat" && (
            <label className="inline">
              <input type="checkbox" checked={readAloud} disabled={!canSpeak()} onChange={(e) => setReadAloud(e.target.checked)} /> {t("readAloud")}
            </label>
            )}
          </div>
          <div className="live-stage">{boards[shown] && boards[shown]!.kind !== "clear" ? <BoardItem action={boards[shown]!} /> : <p className="muted">{t("boardEmpty")}</p>}</div>
          {boards.length > 1 && (
            <div className="live-thumbs">
              {boards.map((b, i) =>
                b.kind === "clear" ? null : (
                  <button key={i} className={`live-thumb ${i === shown ? "on" : ""}`} onClick={() => setPicked(i)} dir="auto">
                    {i + 1}. {b.title ?? b.kind}
                  </button>
                ),
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/** Voice mode: an orb that shows the tutor's state, a caption, and hold-to-talk. */
function VoicePanel(props: { session: LiveSession; state: SessionState; lang: Lang; caption: string; choices: string[]; onChoice: (c: string) => void; onError: (e: unknown) => void }) {
  const { session, state, lang, caption, choices, onChoice, onError } = props;
  const t = useT();
  const size = useStore((s) => s.settings.whisper);
  const [phase, setPhase] = useState<"" | "listening" | "transcribing">("");
  const held = useRef(false);
  const rec = useRef<Promise<Recorder> | null>(null);
  const paused = useRef(false);
  const asking = useRef(false);
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) return <p className="muted live-orbwrap">{t("noMic")}</p>;

  // Pressing stops the tutor mid-sentence; releasing sends what was said.
  const press = (ask: boolean) => {
    if (held.current || phase === "transcribing") return;
    asking.current = ask;
    if (!whisperCached(size) && !confirm(t("whisperConfirm", { size: `${WHISPER_SIZE_MB[size]} MB` }))) return;
    held.current = true;
    stopSpeaking();
    paused.current = state === "speaking" || state === "thinking";
    if (paused.current) session.pause();
    setPhase("listening");
    rec.current = startRecording();
    rec.current.catch((e) => {
      held.current = false;
      rec.current = null;
      setPhase("");
      onError(e);
      if (paused.current) void session.resume().catch(onError);
    });
  };
  const release = async () => {
    if (!held.current) return;
    held.current = false;
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    setPhase("transcribing");
    let text = "";
    try {
      text = await transcribe(await (await r).stop(), size, lang);
    } catch (e) {
      onError(e);
    }
    setPhase("");
    if (!text) {
      if (paused.current) void session.resume().catch(onError);
    } else if (!asking.current && session.awaiting && session.state === "awaiting_answer") void session.answer(text).catch(onError);
    else void session.interrupt(text).catch(onError);
  };

  const look = phase === "listening" ? "listening" : phase || state === "thinking" ? "thinking" : state === "speaking" ? "speaking" : "idle";
  const atCheck = state === "awaiting_answer" && !!session.awaiting;
  const label: StrKey | undefined = phase === "listening" ? "stListening" : phase ? "transcribing" : STATE_LABEL[state];
  return (
    <div className="live-orbwrap">
      <div className="live-orbstate">{label ? t(label) : ""}</div>
      <div className={`live-orb ${look}`} aria-hidden />
      <p className="live-caption" dir="auto" aria-live="polite">
        {caption}
      </p>
      {choices.length > 0 && state === "awaiting_answer" && (
        <div className="live-choices">
          {choices.map((c) => (
            <button key={c} onClick={() => onChoice(c)} dir="auto">
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="row live-talkrow">
        <TalkButton primary label={t(atCheck ? "holdToAnswer" : "holdToTalk")} recording={phase === "listening" && !asking.current} disabled={phase === "transcribing"} onPress={() => press(false)} onRelease={release} />
        {atCheck && <TalkButton label={t("holdToAsk")} recording={phase === "listening" && asking.current} disabled={phase === "transcribing"} onPress={() => press(true)} onRelease={release} />}
      </div>
    </div>
  );
}

function TalkButton(props: { label: string; primary?: boolean; recording: boolean; disabled: boolean; onPress: () => void; onRelease: () => Promise<void> }) {
  const { label, primary, recording, disabled, onPress, onRelease } = props;
  const key = (e: React.KeyboardEvent) => e.key === " " || e.key === "Enter";
  return (
    <button
      className={`live-talk ${primary ? "primary" : ""} ${recording ? "recording" : ""}`}
      disabled={disabled}
      onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), onPress())}
      onPointerUp={() => void onRelease()}
      onPointerCancel={() => void onRelease()}
      onKeyDown={(e) => key(e) && !e.repeat && (e.preventDefault(), onPress())}
      onKeyUp={(e) => key(e) && void onRelease()}
    >
      🎙 {label}
    </button>
  );
}
