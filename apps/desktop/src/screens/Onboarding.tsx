// First run: app language, learner profile, then an optional model.
import { useState } from "react";
import { applyDocumentLang, useT } from "../i18n.ts";
import { useStore } from "../state.ts";
import { ProfileForm } from "../components/ProfileForm.tsx";
import { ModelPicker } from "../components/ModelPicker.tsx";
import { Card } from "../components/common.tsx";

export function Onboarding() {
  const t = useT();
  const { settings, profile, updateSettings, setProfile } = useStore();
  const [step, setStep] = useState(0);
  const finish = () => updateSettings({ onboarded: true });

  return (
    <main className="onboarding">
      <Card>
        <h1>{t("welcome")}</h1>
        {step === 0 && (
          <>
            <p>{t("welcomeBody")}</p>
            <label>
              {t("uiLanguage")}
              <select
                value={settings.uiLang}
                onChange={(e) => {
                  const uiLang = e.target.value as "en" | "ar";
                  applyDocumentLang(uiLang);
                  updateSettings({ uiLang });
                }}
              >
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
            </label>
            <div className="row end">
              <button className="primary" onClick={() => setStep(1)}>
                {t("next")}
              </button>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h2>{t("aboutYou")}</h2>
            <ProfileForm
              initial={profile}
              saveLabel={t("next")}
              onSave={(p) => {
                setProfile(p);
                setStep(2);
              }}
            />
            <button className="link" onClick={() => setStep(0)}>
              {t("back")}
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <h2>{t("modelSetup")}</h2>
            <p className="muted">{t("modelSetupBody")}</p>
            <ModelPicker role="teacher" value={settings.teacher} onChange={(teacher) => updateSettings({ teacher })} emptyLabel={t("none")} />
            <div className="row end">
              <button className="link" onClick={() => setStep(1)}>
                {t("back")}
              </button>
              <button onClick={finish}>{t("skip")}</button>
              <button className="primary" onClick={finish} disabled={!settings.teacher?.model}>
                {t("done")}
              </button>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
