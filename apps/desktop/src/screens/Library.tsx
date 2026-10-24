// Courses: the learner's plans, sample packs, new course from a topic, and
// .kuttab import and export.
import { useEffect, useState } from "react";
import { buildTrack, dayKey, exportPack, goalPace, indexPack, parsePack, planFromPack, planProgress, type Goal, type Lang, type MasteryMap, type Reminder, type SourceMix, type Pack, type Plan } from "@kuttab/engine";
import { useT } from "../i18n.ts";
import { planLang, refreshCounters, saveKb, services, useStore } from "../state.ts";
import { kbEmbed, makeCtx } from "../ai.ts";
import { SearchDeclined, webAdapter } from "../web.ts";
import { Card, ErrorBox, Spinner } from "../components/common.tsx";
import { goalReminders, markReminded, reminderText } from "../tray.ts";

const RAW = import.meta.glob("../../../../packs/*.kuttab", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const SAMPLES: Pack[] = Object.values(RAW).flatMap((text) => {
  try {
    return [parsePack(text)];
  } catch (e) {
    console.warn("Bad sample pack", e);
    return [];
  }
});

export async function importPack(pack: Pack): Promise<Plan> {
  const { course, kb } = services();
  const plan = planFromPack(pack);
  await course.savePlan(plan);
  for (const l of pack.lessons) await course.saveLesson(plan.id, { ...l, generatedBy: "author" });
  if (pack.sources.length) {
    await indexPack(kb, pack);
    await saveKb();
  }
  return plan;
}

function slug(s: string): string {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${base || "course"}-${Date.now().toString(36)}`;
}

export function Library() {
  const t = useT();
  const go = useStore((s) => s.go);
  const profile = useStore((s) => s.profile);
  const uiLang = useStore((s) => s.settings.uiLang);
  const kbVersion = useStore((s) => s.kbVersion);
  const [plans, setPlans] = useState<{ plan: Plan; m: MasteryMap; goal?: Goal }[]>();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [err, setErr] = useState<unknown>();

  const load = async () => {
    const { course } = services();
    const ps = await course.plans();
    setPlans(await Promise.all(ps.map(async (plan) => ({ plan, m: await course.mastery(plan.id), goal: await course.goal(plan.id) }))));
  };
  useEffect(() => {
    void load();
  }, [kbVersion]);
  // Reminders on open (decision 0002 item 23); shown once a day per goal.
  useEffect(() => {
    void goalReminders().then(async (rs) => {
      setReminders(rs);
      await markReminded(rs);
    });
  }, []);

  const addPack = async (pack: Pack) => {
    setErr(undefined);
    try {
      const plan = await importPack(pack);
      await load();
      go({ name: "plan", planId: plan.id });
    } catch (e) {
      setErr(e);
    }
  };

  const doExport = async (plan: Plan) => {
    const { course, platform } = services();
    const lessons = await course.lessons(plan.id);
    const text = exportPack(plan, lessons, { description: plan.description ?? plan.title, lang: planLang(plan), author: profile?.name, license: "CC-BY-4.0" });
    await platform.saveFile(`${plan.id}.kuttab`, text);
  };

  const owned = new Set(plans?.map((p) => p.plan.id));
  const samples = [...SAMPLES].sort((a, b) => Number(b.lang === uiLang) - Number(a.lang === uiLang));

  return (
    <main className="library">
      <h1>{t("yourCourses")}</h1>
      {err !== undefined && <ErrorBox error={err} />}
      {reminders.length > 0 && (
        <div className="reminder-banner" role="status">
          <strong>{t("reminders")}</strong>
          <ul>
            {reminders.map((r) => (
              <li key={r.goal.planId} dir="auto">
                {reminderText(r)}{" "}
                <button className="link" onClick={() => go({ name: "plan", planId: r.plan.id })}>
                  {t("continue")}
                </button>
              </li>
            ))}
          </ul>
          <button className="link" onClick={() => setReminders([])} aria-label={t("dismiss")}>
            ✕
          </button>
        </div>
      )}
      {!plans ? (
        <Spinner />
      ) : plans.length === 0 ? (
        <p className="muted">{t("noCourses")}</p>
      ) : (
        <div className="grid-cards">
          {plans.map(({ plan, m, goal }) => {
            const pct = Math.round(planProgress(plan, m) * 100);
            return (
              <Card key={plan.id} className="course">
                <h3 dir="auto">{plan.title}</h3>
                {plan.description && (
                  <p className="muted small" dir="auto">
                    {plan.description}
                  </p>
                )}
                <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("progress")}>
                  <span style={{ inlineSize: `${pct}%` }} />
                </div>
                <small className="muted">
                  {pct}% · {plan.items.length} · {planLang(plan) === "ar" ? "العربية" : "English"}
                </small>
                <GoalRow plan={plan} m={m} goal={goal} onChange={load} />
                <div className="row">
                  <button className="primary" onClick={() => go({ name: "plan", planId: plan.id })}>
                    {t("continue")}
                  </button>
                  <button onClick={() => void doExport(plan).catch(setErr)}>{t("exportPack")}</button>
                  <button
                    className="link danger"
                    onClick={async () => {
                      if (!confirm(t("deleteConfirm"))) return;
                      await services().course.deletePlan(plan.id);
                      await refreshCounters();
                      await load();
                    }}
                  >
                    {t("delete")}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NewCourse onCreated={(id) => go({ name: "plan", planId: id })} />

      <h2>{t("samples")}</h2>
      <div className="grid-cards">
        {samples.map((p) => (
          <Card key={p.id} className="sample">
            <h3 dir="auto">{p.title}</h3>
            <p className="muted small" dir="auto">
              {p.description}
            </p>
            <small className="muted">
              {p.objectives.length} · {p.lang === "ar" ? "العربية" : "English"}
            </small>
            <div className="row">
              {owned.has(p.id) ? (
                <button onClick={() => go({ name: "plan", planId: p.id })}>{t("added")} ✓</button>
              ) : (
                <button className="primary" onClick={() => void addPack(p)}>
                  {t("openSample")}
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <label className="file-button">
        {t("importPack")}
        <input
          type="file"
          accept=".kuttab,application/json"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              await addPack(parsePack(await f.text()));
            } catch (er) {
              setErr(er);
            }
          }}
        />
      </label>
    </main>
  );
}

/** A finish date for one course (decision 0002 item 20), its pace, and whether it reminds. */
function GoalRow({ plan, m, goal, onChange }: { plan: Plan; m: MasteryMap; goal?: Goal; onChange: () => void }) {
  const t = useT();
  const { course } = services();
  const save = async (g: Goal | undefined) => {
    if (g) await course.saveGoal(g);
    else await course.dropGoal(plan.id);
    onChange();
  };
  const pace = goal ? goalPace(plan, m, goal) : undefined;
  return (
    <div className="goal-row small">
      <label>
        {t("goalDue")}
        <input
          type="date"
          min={dayKey()}
          value={goal?.due ?? ""}
          onChange={(e) => void save(e.target.value ? { planId: plan.id, since: goal?.since ?? dayKey(), remind: goal?.remind ?? true, ...goal, due: e.target.value } : undefined)}
        />
      </label>
      {goal && (
        <label className="check">
          <input type="checkbox" checked={goal.remind} onChange={(e) => void save({ ...goal, remind: e.target.checked })} />
          {t("goalRemind")}
        </label>
      )}
      {pace && (
        <span className={`pace pace-${pace.status}`}>
          {t(`pace_${pace.status}` as const, { perWeek: pace.perWeek, days: pace.daysLeft })}
        </span>
      )}
    </div>
  );
}

function NewCourse({ onCreated }: { onCreated: (planId: string) => void }) {
  const t = useT();
  const profile = useStore((s) => s.profile);
  const uiLang = useStore((s) => s.settings.uiLang);
  const [topic, setTopic] = useState("");
  const [lang, setLang] = useState<Lang>(profile?.lang ?? uiLang);
  const [mix, setMix] = useState<SourceMix>("none");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  const hasSources = services().kb.size > 0;

  const create = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      const ctx = await makeCtx();
      const p = { ...(profile ?? { goal: "", level: "new" as const, minutesPerDay: 20, style: "examples-first" as const }), lang };
      const { course, kb } = services();
      const input = { topic: topic.trim(), profile: p, mix, kb, embed: await kbEmbed(), makeId: slug };
      const web = webAdapter(() => confirm(t("searchApprove")));
      // A declined search builds from the library alone.
      const built = await buildTrack(ctx, { ...input, web }).catch((e) => {
        if (e instanceof SearchDeclined) return buildTrack(ctx, input);
        throw e;
      });
      await course.savePlan(built.plan);
      await course.saveResources(built.pack);
      if (built.added.length) await saveKb();
      onCreated(built.plan.id);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="new-course">
      <h2>{t("newCourse")}</h2>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (topic.trim()) void create();
        }}
      >
        <label>
          {t("topic")}
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("topicPh")} dir="auto" disabled={busy} />
        </label>
        <div className="row">
          <label>
            {t("courseLang")}
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} disabled={busy}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <label>
            {t("sourceMix")}
            <select value={mix} onChange={(e) => setMix(e.target.value as SourceMix)} disabled={busy}>
              <option value="none">{t("mixNone")}</option>
              <option value="mine" disabled={!hasSources}>{t("mixMine")}</option>
              <option value="mine-then-web">{t("mixWeb")}</option>
            </select>
          </label>
        </div>
        <button className="primary" type="submit" disabled={busy || !topic.trim()}>
          {busy ? t("creating") : t("createPlan")}
        </button>
        {busy && <Spinner label={t("creating")} />}
      </form>
      {err !== undefined && <ErrorBox error={err} onRetry={create} />}
    </Card>
  );
}
