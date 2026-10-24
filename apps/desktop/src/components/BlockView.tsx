// One lesson block. Pure UI: it reports results through `onResult` and the
// parent records them, so the lesson and review screens share it.
import { useState } from "react";
import { explainOutcome, gradeReflection, type Block, type Lang } from "@kuttab/engine";
import type { GradeOutcome, RunOutput } from "@kuttab/labs";
import { useT } from "../i18n.ts";
import { Markdown } from "../markdown.tsx";
import { errorText, hasTeacher, makeCtx } from "../ai.ts";
import { services } from "../state.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { MicButton, RunOutputView, SpeakButton, Spinner } from "./common.tsx";

export interface BlockProps {
  block: Block;
  lang: Lang;
  /** Called with each graded attempt that should count as evidence. */
  onResult?: (correct: boolean) => void;
  /** Called once the learner may move past this block. */
  onComplete?: () => void;
}

export function BlockView(p: BlockProps) {
  const b = p.block;
  switch (b.type) {
    case "explain":
    case "recap":
      return (
        <div className={`block ${b.type}`}>
          <div className="block-tools">
            <SpeakButton text={b.markdown} lang={p.lang} />
          </div>
          <Markdown text={b.markdown} />
        </div>
      );
    case "example":
      return (
        <div className="block example">
          <Markdown text={b.markdown} />
          {b.code && (
            <pre className="code" dir="ltr">
              <code>{b.code}</code>
            </pre>
          )}
        </div>
      );
    case "check":
      return <CheckBlock {...p} block={b} />;
    case "exercise":
      return <ExerciseBlock {...p} block={b} />;
    case "reflect":
      return <ReflectBlock {...p} block={b} />;
  }
}

function CheckBlock({ block, onResult, onComplete }: BlockProps & { block: Extract<Block, { type: "check" }> }) {
  const t = useT();
  const [pick, setPick] = useState<number>();
  const [done, setDone] = useState(false);
  const ok = pick === block.answer;
  return (
    <div className="block check">
      <Markdown text={block.question} />
      <div className="choices" role="radiogroup">
        {block.choices.map((c, i) => (
          <label key={i} className={`choice ${done && i === block.answer ? "right" : ""} ${done && i === pick && !ok ? "wrong" : ""}`}>
            <input type="radio" name={block.id} disabled={done} checked={pick === i} onChange={() => setPick(i)} />
            <Markdown text={c} className="inline" />
          </label>
        ))}
      </div>
      {!done ? (
        <button
          className="primary"
          disabled={pick === undefined}
          onClick={() => {
            setDone(true);
            onResult?.(pick === block.answer);
            onComplete?.();
          }}
        >
          {t("check")}
        </button>
      ) : (
        <div className={`verdict ${ok ? "ok" : "bad"}`}>
          <strong>{ok ? t("correct") : t("notQuite")}</strong>
          <Markdown text={block.explanation} />
        </div>
      )}
    </div>
  );
}

function ExerciseBlock({ block, lang, onResult, onComplete }: BlockProps & { block: Extract<Block, { type: "exercise" }> }) {
  const t = useT();
  const ex = block.exercise;
  const [code, setCode] = useState(ex.starter ?? "");
  const [out, setOut] = useState<RunOutput>();
  const [grade, setGrade] = useState<GradeOutcome>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [fails, setFails] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [passedOnce, setPassedOnce] = useState(false);
  const [hints, setHints] = useState(0);
  const [solution, setSolution] = useState(false);
  const [feedback, setFeedback] = useState("");

  const rt = () => services().labs.get(ex.language);

  const run = async () => {
    setBusy(true);
    setErr(undefined);
    setGrade(undefined);
    try {
      setOut(await rt().run(code, { setup: ex.setup }));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setErr(undefined);
    setFeedback("");
    try {
      const g = await rt().grade(ex, code);
      setGrade(g);
      setOut(g.output);
      const n = attempts + 1;
      setAttempts(n);
      // Evidence: the first submit, plus the first pass after a failed start.
      if (n === 1 || (g.passed && !passedOnce)) onResult?.(g.passed);
      if (g.passed) {
        if (!passedOnce) onComplete?.();
        setPassedOnce(true);
      } else setFails((f) => f + 1);
      setBusy(false);
      if (hasTeacher()) {
        const ctx = await makeCtx();
        for await (const chunk of explainOutcome(ctx, ex, code, g, lang)) setFeedback((s) => s + chunk);
      }
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="block exercise">
      <Markdown text={ex.prompt} />
      <CodeEditor value={code} onChange={setCode} mode={ex.language} onRun={run} />
      <div className="row">
        <button onClick={run} disabled={busy}>
          {t("run")}
        </button>
        <button className="primary" onClick={submit} disabled={busy || !code.trim()}>
          {t("submit")}
        </button>
        <button onClick={() => setCode(ex.starter ?? "")} disabled={busy}>
          {t("reset")}
        </button>
        {!!ex.hints?.length && hints < ex.hints.length && <button onClick={() => setHints((h) => h + 1)}>{t("hint")}</button>}
        {fails >= 2 && !solution && (
          <button
            onClick={() => {
              setSolution(true);
              onComplete?.();
            }}
          >
            {t("showSolution")}
          </button>
        )}
        {busy && <Spinner />}
      </div>
      {ex.hints?.slice(0, hints).map((h, i) => (
        <div className="hint" key={i}>
          💡 <Markdown text={h} className="inline" />
        </div>
      ))}
      {grade && (
        <div className={`verdict ${grade.passed ? "ok" : "bad"}`}>
          <strong>{grade.passed ? t("passed") : t("failed")}</strong> <span dir="auto">{grade.reason}</span>
          {feedback && <Markdown text={feedback} />}
        </div>
      )}
      {out && <RunOutputView out={out} />}
      {err && <div className="error">{err}</div>}
      {solution && (
        <div className="solution">
          <strong>{t("solution")}</strong>
          <pre className="code" dir="ltr">
            <code>{ex.solution}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

function ReflectBlock({ block, lang, onResult, onComplete }: BlockProps & { block: Extract<Block, { type: "reflect" }> }) {
  const t = useT();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; feedback: string }>();
  const [selfAssess, setSelfAssess] = useState(false);
  const [err, setErr] = useState<string>();

  const finish = (passed: boolean, feedback = "") => {
    setResult({ passed, feedback });
    onResult?.(passed);
    onComplete?.();
  };

  const submit = async () => {
    setErr(undefined);
    if (!hasTeacher()) {
      setSelfAssess(true);
      return;
    }
    setBusy(true);
    try {
      const r = await gradeReflection(await makeCtx(), block.prompt, block.rubric, answer, lang);
      finish(r.passed, r.feedback);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="block reflect">
      <Markdown text={block.prompt} />
      <div className="answer-row">
        <textarea rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t("yourAnswer")} disabled={!!result} dir="auto" />
        <MicButton lang={lang} onText={(s) => setAnswer((a) => (a ? `${a} ${s}` : s))} />
      </div>
      {!result && !selfAssess && (
        <button className="primary" onClick={submit} disabled={busy || answer.trim().length < 3}>
          {busy ? t("grading") : t("submit")}
        </button>
      )}
      {selfAssess && !result && (
        <div className="self-assess">
          <Markdown text={block.rubric} />
          <div className="row">
            <button onClick={() => finish(true)}>{t("correct")}</button>
            <button onClick={() => finish(false)}>{t("notQuite")}</button>
          </div>
        </div>
      )}
      {result && (
        <div className={`verdict ${result.passed ? "ok" : "bad"}`}>
          <strong>{result.passed ? t("passed") : t("failed")}</strong>
          {result.feedback && <Markdown text={result.feedback} />}
        </div>
      )}
      {err && <div className="error">{err}</div>}
    </div>
  );
}

/** Id used for review cards and evidence, when a block has one. */
export function blockId(b: Block): string | undefined {
  if (b.type === "check" || b.type === "reflect") return b.id;
  if (b.type === "exercise") return b.exercise.id;
  return undefined;
}

export function isGate(b: Block): boolean {
  return b.type === "check" || b.type === "exercise" || b.type === "reflect";
}
