import { useState } from "react";
import type { LearnerProfile } from "@kuttab/engine";
import { useT } from "../i18n.ts";
import { useStore } from "../state.ts";

export function ProfileForm({ initial, onSave, saveLabel }: { initial?: LearnerProfile; onSave: (p: LearnerProfile) => void; saveLabel?: string }) {
  const t = useT();
  const uiLang = useStore((s) => s.settings.uiLang);
  const [p, setP] = useState<LearnerProfile>(initial ?? { lang: uiLang, goal: "", level: "new", minutesPerDay: 20, style: "examples-first" });
  const up = (patch: Partial<LearnerProfile>) => setP((x) => ({ ...x, ...patch }));
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...p, name: p.name?.trim() || undefined, goal: p.goal.trim() });
      }}
    >
      <label>
        {t("name")}
        <input value={p.name ?? ""} onChange={(e) => up({ name: e.target.value })} dir="auto" />
      </label>
      <label>
        {t("goal")}
        <input value={p.goal} onChange={(e) => up({ goal: e.target.value })} placeholder={t("goalPh")} dir="auto" />
      </label>
      <label>
        {t("courseLang")}
        <select value={p.lang} onChange={(e) => up({ lang: e.target.value as LearnerProfile["lang"] })}>
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </select>
      </label>
      <fieldset>
        <legend>{t("level")}</legend>
        {(["new", "some", "experienced"] as const).map((l) => (
          <label key={l} className="inline">
            <input type="radio" checked={p.level === l} onChange={() => up({ level: l })} />
            {t(l === "new" ? "levelNew" : l === "some" ? "levelSome" : "levelExperienced")}
          </label>
        ))}
      </fieldset>
      <label>
        {t("minutes")}: {p.minutesPerDay}
        <input type="range" min={5} max={120} step={5} value={p.minutesPerDay} onChange={(e) => up({ minutesPerDay: Number(e.target.value) })} />
      </label>
      <fieldset>
        <legend>{t("style")}</legend>
        {(["examples-first", "theory-first", "practice-first"] as const).map((s) => (
          <label key={s} className="inline">
            <input type="radio" checked={p.style === s} onChange={() => up({ style: s })} />
            {t(s === "examples-first" ? "styleExamples" : s === "theory-first" ? "styleTheory" : "stylePractice")}
          </label>
        ))}
      </fieldset>
      <button className="primary" type="submit">
        {saveLabel ?? t("save")}
      </button>
    </form>
  );
}
