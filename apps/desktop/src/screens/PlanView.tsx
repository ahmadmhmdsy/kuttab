// The learning plan, shown to the learner, who can reorder, rename, skip,
// remove and add steps.
import { useEffect, useState } from "react";
import { addObjective, itemState, moveObjective, nextObjective, planProgress, removeObjective, renameObjective, searchMore, setStatus, type MasteryMap, type Plan, type PlanItem, type ResourcePack } from "@kuttab/engine";
import { useT, type StrKey } from "../i18n.ts";
import { saveKb, services, useStore } from "../state.ts";
import { kbEmbed } from "../ai.ts";
import { SearchDeclined, webAdapter } from "../web.ts";
import { Card, ErrorBox, Spinner } from "../components/common.tsx";

const STATE_LABEL: Record<string, StrKey> = { locked: "locked", available: "available", mastered: "mastered", skipped: "skipped" };

export function PlanView({ planId }: { planId: string }) {
  const t = useT();
  const go = useStore((s) => s.go);
  const [plan, setPlan] = useState<Plan | null>();
  const [m, setM] = useState<MasteryMap>({});
  const [editing, setEditing] = useState<string>();
  const [err, setErr] = useState<unknown>();
  const [pack, setPack] = useState<ResourcePack>();

  useEffect(() => {
    const { course } = services();
    void Promise.all([course.plan(planId), course.mastery(planId), course.resources(planId)]).then(([p, mm, rp]) => {
      setPlan(p ?? null);
      setM(mm);
      setPack(rp);
    });
  }, [planId]);

  if (plan === undefined) return <Spinner />;
  if (plan === null)
    return (
      <main>
        <ErrorBox error={new Error("Course not found")} />
        <button onClick={() => go({ name: "library" })}>{t("library")}</button>
      </main>
    );

  const save = async (next: Plan) => {
    setErr(undefined);
    try {
      await services().course.savePlan(next);
      setPlan(next);
    } catch (e) {
      setErr(e);
    }
  };
  const apply = (fn: (p: Plan) => Plan) => {
    try {
      void save(fn(plan));
    } catch (e) {
      setErr(e);
    }
  };

  const next = nextObjective(plan, m);
  const pct = Math.round(planProgress(plan, m) * 100);

  return (
    <main className="plan">
      <button className="link" onClick={() => go({ name: "library" })}>
        ← {t("library")}
      </button>
      <h1 dir="auto">{plan.title}</h1>
      <p className="muted">{t("planHelp")}</p>
      {pack && <PackLine pack={pack} objective={next} onPack={setPack} />}
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("progress")}>
        <span style={{ inlineSize: `${pct}%` }} />
      </div>
      {next ? (
        <div className="row">
          <button className="primary big" onClick={() => go({ name: "lesson", planId, objectiveId: next.id })}>
            {t("start")}: <span dir="auto">{next.title}</span>
          </button>
          <button className="big" onClick={() => go({ name: "live", planId, objectiveId: next.id })}>
            🎙 {t("liveStart")}
          </button>
        </div>
      ) : (
        <p className="ok">{t("allDone")}</p>
      )}
      {err !== undefined && <ErrorBox error={err} />}

      <ol className="steps">
        {plan.items.map((it, i) => {
          const st = itemState(plan, m, it);
          const score = Math.round((m[it.id]?.score ?? 0) * 100);
          return (
            <li key={it.id} className={`step ${st}`}>
              {editing === it.id ? (
                <RenameForm
                  item={it}
                  onCancel={() => setEditing(undefined)}
                  onSave={(title, summary) => {
                    setEditing(undefined);
                    apply((p) => renameObjective(p, it.id, title, summary));
                  }}
                />
              ) : (
                <>
                  <div className="step-head">
                    <span className={`badge ${st}`}>{t(STATE_LABEL[st])}</span>
                    <strong dir="auto">{it.title}</strong>
                    {it.lab && <span className="badge lab">{it.lab}</span>}
                    {score > 0 && st !== "mastered" && <small className="muted">{score}%</small>}
                  </div>
                  <p className="muted small" dir="auto">
                    {it.summary}
                  </p>
                  {it.prereqs.length > 0 && (
                    <p className="muted small">
                      {t("prereqs")}: {it.prereqs.map((id) => plan.items.find((x) => x.id === id)?.title ?? id).join(", ")}
                    </p>
                  )}
                  <div className="row tight">
                    {st !== "skipped" && st !== "locked" && (
                      <>
                        <button onClick={() => go({ name: "lesson", planId, objectiveId: it.id })}>{t("start")}</button>
                        <button onClick={() => go({ name: "live", planId, objectiveId: it.id })}>{t("live")}</button>
                      </>
                    )}
                    <button onClick={() => apply((p) => setStatus(p, it.id, it.status === "skipped" ? "todo" : "skipped"))}>{it.status === "skipped" ? t("unskip") : t("skipStep")}</button>
                    <button onClick={() => setEditing(it.id)}>{t("rename")}</button>
                    <button className="icon" disabled={i === 0} title={t("moveUp")} aria-label={t("moveUp")} onClick={() => apply((p) => moveObjective(p, it.id, -1))}>
                      ↑
                    </button>
                    <button className="icon" disabled={i === plan.items.length - 1} title={t("moveDown")} aria-label={t("moveDown")} onClick={() => apply((p) => moveObjective(p, it.id, 1))}>
                      ↓
                    </button>
                    <button className="link danger" onClick={() => apply((p) => removeObjective(p, it.id))}>
                      {t("remove")}
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ol>

      <AddStep plan={plan} onAdd={(o) => apply((p) => addObjective(p, o))} />
    </main>
  );
}

function RenameForm({ item, onSave, onCancel }: { item: PlanItem; onSave: (title: string, summary: string) => void; onCancel: () => void }) {
  const t = useT();
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary);
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onSave(title.trim(), summary.trim());
      }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} dir="auto" aria-label={t("stepTitle")} autoFocus />
      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} dir="auto" aria-label={t("stepSummary")} />
      <div className="row tight">
        <button className="primary" type="submit">
          {t("save")}
        </button>
        <button type="button" onClick={onCancel}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

function AddStep({ plan, onAdd }: { plan: Plan; onAdd: (o: { id: string; title: string; summary: string; prereqs: string[]; lab?: string }) => void }) {
  const t = useT();
  const labs = services().labs.list();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [lab, setLab] = useState("");
  const [prereqs, setPrereqs] = useState<string[]>([]);
  if (!open)
    return (
      <button onClick={() => setOpen(true)}>
        + {t("addStep")}
      </button>
    );
  const makeId = () => {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "step";
    let id = base;
    for (let n = 2; plan.items.some((x) => x.id === id); n++) id = `${base}-${n}`;
    return id;
  };
  return (
    <Card>
      <h3>{t("addStep")}</h3>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onAdd({ id: makeId(), title: title.trim(), summary: summary.trim() || title.trim(), prereqs, lab: lab || undefined });
          setOpen(false);
          setTitle("");
          setSummary("");
          setPrereqs([]);
          setLab("");
        }}
      >
        <label>
          {t("stepTitle")}
          <input value={title} onChange={(e) => setTitle(e.target.value)} dir="auto" autoFocus />
        </label>
        <label>
          {t("stepSummary")}
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} dir="auto" />
        </label>
        <label>
          {t("language")}
          <select value={lab} onChange={(e) => setLab(e.target.value)}>
            <option value="">{t("none")}</option>
            {labs.map((l) => (
              <option key={l.language} value={l.language}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        {plan.items.length > 0 && (
          <fieldset>
            <legend>{t("prereqs")}</legend>
            {plan.items.map((it) => (
              <label key={it.id} className="inline">
                <input type="checkbox" checked={prereqs.includes(it.id)} onChange={(e) => setPrereqs((p) => (e.target.checked ? [...p, it.id] : p.filter((x) => x !== it.id)))} />
                <span dir="auto">{it.title}</span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="row tight">
          <button className="primary" type="submit" disabled={!title.trim()}>
            {t("add")}
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </Card>
  );
}

/** What the track was built from; the pack is what lessons read, so it works offline. */
function PackLine({ pack, objective, onPack }: { pack: ResourcePack; objective?: PlanItem; onPack: (p: ResourcePack) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [err, setErr] = useState<unknown>();
  // A mid-track search for the next objective; works on any source mix.
  const more = async () => {
    if (!objective) return;
    setBusy(true);
    setErr(undefined);
    setNote(undefined);
    try {
      const { course, kb } = services();
      const web = webAdapter(() => confirm(t("searchApprove")));
      const got = await searchMore({ pack, objective, query: "", web, kb, embed: await kbEmbed() });
      await course.saveResources(got.pack);
      if (got.added.length) await saveKb();
      onPack(got.pack);
      setNote(t("searchMoreDone", { n: got.found.length }));
    } catch (e) {
      if (e instanceof SearchDeclined) setNote(t("searchDeclined"));
      else setErr(e);
    } finally {
      setBusy(false);
    }
  };
  const all = Object.values(pack.objectives).flat();
  const sources = new Set(all.map((e) => e.sourceId)).size;
  const web = new Set(all.filter((e) => e.url).map((e) => e.sourceId)).size;
  return (
    <div className="muted small pack-line">
      {pack.mix === "none" ? t("packNone") : t("packLine", { n: all.length, sources, web })}
      {pack.webSkipped && <> · {t("webSkipped")}</>}
      {objective && (
        <>
          {" "}
          <button className="link" disabled={busy} onClick={() => void more()}>
            {busy ? <Spinner /> : t("searchMore")}
          </button>
        </>
      )}
      {note && <> · {note}</>}
      {err !== undefined && <ErrorBox error={err} />}
    </div>
  );
}
