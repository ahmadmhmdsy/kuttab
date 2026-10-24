import { useEffect, useState } from "react";
import { useT, type StrKey } from "./i18n.ts";
import { services, switchLearner, useStore, type Route } from "./state.ts";
import { onWebLlmProgress, type WebLlmProgress } from "./platform/webllm.ts";
import { Onboarding } from "./screens/Onboarding.tsx";
import { Library } from "./screens/Library.tsx";
import { PlanView } from "./screens/PlanView.tsx";
import { LessonView } from "./screens/LessonView.tsx";
import { LiveView } from "./screens/LiveView.tsx";
import { Review } from "./screens/Review.tsx";
import { Sources } from "./screens/Sources.tsx";
import { Playground } from "./screens/Playground.tsx";
import { Settings, UsageText } from "./screens/Settings.tsx";
import { Memory } from "./screens/Memory.tsx";
import { Progress } from "./screens/Progress.tsx";

const NAV: { name: Route["name"]; label: StrKey }[] = [
  { name: "library", label: "library" },
  { name: "progress", label: "progress" },
  { name: "review", label: "review" },
  { name: "sources", label: "sources" },
  { name: "playground", label: "playground" },
  { name: "settings", label: "settings" },
];

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case "library":
      return <Library />;
    case "plan":
      return <PlanView key={route.planId} planId={route.planId} />;
    case "lesson":
      return <LessonView key={`${route.planId}/${route.objectiveId}`} planId={route.planId} objectiveId={route.objectiveId} />;
    case "live":
      return <LiveView key={`${route.planId}/${route.objectiveId}`} planId={route.planId} objectiveId={route.objectiveId} />;
    case "review":
      return <Review />;
    case "sources":
      return <Sources />;
    case "playground":
      return <Playground />;
    case "settings":
      return <Settings />;
    case "memory":
      return <Memory />;
    case "progress":
      return <Progress />;
  }
}

/** Who is learning, when more than one learner uses this computer (decision 0002 item 21). */
function LearnerSwitch() {
  const t = useT();
  useStore((s) => s.kbVersion); // saveLearners bumps it
  const { learners } = services();
  if (learners.list.length < 2) return null;
  return (
    <select className="learner-switch" aria-label={t("learners")} value={learners.current} onChange={(e) => void switchLearner(e.target.value)}>
      {learners.list.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name || t("learnerUnnamed")}
        </option>
      ))}
    </select>
  );
}

export function App() {
  const t = useT();
  const { route, go, settings, dueCount, streak, session } = useStore();
  const [llm, setLlm] = useState<WebLlmProgress>();
  useEffect(() => onWebLlmProgress((p) => setLlm(p.progress >= 1 ? undefined : p)), []);

  if (!settings.onboarded) return <Onboarding />;
  const section = route.name === "plan" || route.name === "lesson" || route.name === "live" ? "library" : route.name === "memory" ? "settings" : route.name;

  return (
    <div className="app">
      <header className="top">
        <button className="brand" onClick={() => go({ name: "library" })}>
          <img src="/icon.png" alt="" width={24} height={24} />
          {t("appName")}
        </button>
        <nav>
          {NAV.map((n) => (
            <button key={n.name} className={section === n.name ? "active" : ""} aria-current={section === n.name ? "page" : undefined} onClick={() => go({ name: n.name } as Route)}>
              {t(n.label)}
              {n.name === "review" && dueCount > 0 && <span className="pill">{dueCount}</span>}
            </button>
          ))}
        </nav>
        <div className="status small muted">
          <LearnerSwitch />
          {streak > 0 && (
            <span title={t("streak")}>
              🔥 {streak}
            </span>
          )}
          {session.inputTokens + session.outputTokens > 0 && (
            <span title={t("session")}>
              <UsageText u={session} />
            </span>
          )}
        </div>
      </header>
      {llm && (
        <div className="llm-progress" role="status">
          {t("loadingModel")}: {llm.model} — {Math.round(llm.progress * 100)}%
          <div className="progress">
            <span style={{ inlineSize: `${Math.round(llm.progress * 100)}%` }} />
          </div>
        </div>
      )}
      <Screen route={route} />
    </div>
  );
}
