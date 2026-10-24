// "What the tutor knows about me": the learner memory (global and per course), editable here.
import { useEffect, useState } from "react";
import { addFacts, type LearnerMemory, type MemoryFact, type Plan } from "@kuttab/engine";
import { useT, type StrKey } from "../i18n.ts";
import { services, useStore } from "../state.ts";
import { Card, Spinner } from "../components/common.tsx";

const FROM: Record<MemoryFact["from"], StrKey> = { session: "factFromSession", chat: "factFromChat", you: "factFromYou" };

function FactRow({ fact, onSave, onDelete }: { fact: MemoryFact; onSave: (text: string) => void; onDelete: () => void }) {
  const t = useT();
  const [text, setText] = useState<string>();
  if (text !== undefined)
    return (
      <li className="fact">
        <input value={text} maxLength={200} autoFocus onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && text.trim() && (onSave(text.trim()), setText(undefined))} />
        <button className="primary" disabled={!text.trim()} onClick={() => (onSave(text.trim()), setText(undefined))}>{t("save")}</button>
        <button onClick={() => setText(undefined)}>{t("cancel")}</button>
      </li>
    );
  return (
    <li className="fact">
      <span>{fact.text}</span>
      <small className="muted">{t(FROM[fact.from])}</small>
      <button className="link" onClick={() => setText(fact.text)}>{t("edit")}</button>
      <button className="link" onClick={onDelete}>{t("delete")}</button>
    </li>
  );
}

function Scope({ title, facts, trackId, mem, save }: { title: string; facts: MemoryFact[]; trackId?: string; mem: LearnerMemory; save: (m: LearnerMemory) => void }) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    save(addFacts(mem, [{ text: draft, trackId, from: "you" }]));
    setDraft("");
  };
  return (
    <Card>
      <h2>{title}</h2>
      {facts.length ? (
        <ul className="facts">
          {facts.map((f) => (
            <FactRow
              key={f.id}
              fact={f}
              onSave={(text) => save({ facts: mem.facts.map((x) => (x.id === f.id ? { ...x, text, from: "you", at: Date.now() } : x)) })}
              onDelete={() => save({ facts: mem.facts.filter((x) => x.id !== f.id) })}
            />
          ))}
        </ul>
      ) : (
        <p className="muted">{t("noFacts")}</p>
      )}
      <div className="row">
        <input value={draft} maxLength={200} placeholder={t("addFactHint")} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button disabled={!draft.trim()} onClick={add}>{t("addFact")}</button>
      </div>
    </Card>
  );
}

export function Memory() {
  const t = useT();
  const go = useStore((s) => s.go);
  const [mem, setMem] = useState<LearnerMemory>();
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    const { course } = services();
    void Promise.all([course.memory(), course.plans()]).then(([m, p]) => {
      setMem(m);
      setPlans(p);
    });
  }, []);

  if (!mem) return <Spinner />;
  const save = (m: LearnerMemory) => {
    setMem(m);
    void services().course.saveMemory(m);
  };
  return (
    <main className="memory">
      <button className="link" onClick={() => go({ name: "settings" })}>← {t("settings")}</button>
      <h1>{t("tutorKnows")}</h1>
      <p className="muted">{t("tutorKnowsIntro")}</p>
      <Scope title={t("aboutYouAll")} facts={mem.facts.filter((f) => !f.trackId)} mem={mem} save={save} />
      {plans.map((p) => (
        <Scope key={p.id} title={p.title} trackId={p.id} facts={mem.facts.filter((f) => f.trackId === p.id)} mem={mem} save={save} />
      ))}
    </main>
  );
}
