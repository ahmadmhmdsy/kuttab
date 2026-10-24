// Progress: a skills map of every course, one tile per step, coloured by what is mastered.
import { useEffect, useState } from "react";
import { itemState, planProgress, type ItemState, type MasteryMap, type Plan } from "@kuttab/engine";
import { useT, type StrKey } from "../i18n.ts";
import { services, useStore } from "../state.ts";
import { Card, Spinner } from "../components/common.tsx";

const STATE_LABEL: Record<ItemState, StrKey> = { locked: "locked", available: "available", mastered: "mastered", skipped: "skipped" };

export function Progress() {
  const t = useT();
  const go = useStore((s) => s.go);
  const [rows, setRows] = useState<{ plan: Plan; m: MasteryMap }[]>();

  useEffect(() => {
    const { course } = services();
    void course.plans().then(async (ps) => setRows(await Promise.all(ps.map(async (plan) => ({ plan, m: await course.mastery(plan.id) })))));
  }, []);

  if (!rows) return <Spinner />;
  return (
    <main className="skills">
      <h1>{t("skillsMap")}</h1>
      <p className="muted">{t("skillsIntro")}</p>
      {!rows.length && <p className="muted">{t("skillsNone")}</p>}
      {rows.map(({ plan, m }) => {
        const states = plan.items.map((it) => itemState(plan, m, it));
        const done = states.filter((s) => s === "mastered").length;
        return (
          <Card key={plan.id}>
            <div className="row">
              <h2 dir="auto">{plan.title}</h2>
              <small className="muted">
                {done}/{plan.items.length} {t("mastered")}
              </small>
            </div>
            <div className="progress" role="progressbar" aria-valuenow={Math.round(planProgress(plan, m) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={t("progress")}>
              <span style={{ inlineSize: `${Math.round(planProgress(plan, m) * 100)}%` }} />
            </div>
            <ul className="skill-map">
              {plan.items.map((it, i) => {
                const st = states[i]!;
                const score = Math.round((m[it.id]?.score ?? 0) * 100);
                return (
                  <li key={it.id}>
                    <button className={`skill ${st}`} title={`${t(STATE_LABEL[st])}${score ? ` · ${score}%` : ""}`} onClick={() => go({ name: "plan", planId: plan.id })}>
                      <span dir="auto">{it.title}</span>
                      <span className="skill-meter" aria-hidden>
                        <span style={{ inlineSize: `${st === "mastered" ? 100 : score}%` }} />
                      </span>
                      <small className="muted">{t(STATE_LABEL[st])}{score > 0 && st !== "mastered" ? ` · ${score}%` : ""}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </main>
  );
}
