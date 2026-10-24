import { useState, type ReactNode } from "react";
import { TEACHER_TOOLS, type ToolName } from "@kuttab/engine";
import { CATALOG, nativeSearchProvider, PROVIDERS, SEARCH_ENGINES, supportsTools } from "@kuttab/llm-gateway";
import { applyDocumentLang, useT } from "../i18n.ts";
import { modelKey, resetUsage, services, useStore, type ModelChoice, type SearchKind, type Settings as AppSettings, type Usage, type VoiceSettings, type WhisperSize } from "../state.ts";
import { errorText, keyId } from "../ai.ts";
import { BackupError, makeBackup, MAX_BACKUP_BYTES, parseBackup, restoreBackup } from "../backup.ts";
import { KeyField, ModelPicker } from "../components/ModelPicker.tsx";
import { searchKeyId } from "../web.ts";
import { ProfileForm } from "../components/ProfileForm.tsx";
import { Card } from "../components/common.tsx";
import { canSpeak, WHISPER_SIZE_MB } from "../speech.ts";

export function UsageText({ u }: { u: Usage }) {
  const t = useT();
  const tokens = u.inputTokens + u.outputTokens;
  return (
    <span>
      {tokens.toLocaleString()} {t("tokens")} · ${u.cost.toFixed(u.cost < 1 ? 4 : 2)}
      {u.unknown ? ` (${t("costUnknown")})` : ""}
    </span>
  );
}

const TABS = ["models", "teacher", "learning", "voice", "appearance", "usage", "privacy"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL = { models: "tabModels", teacher: "tabTeacher", learning: "tabLearning", voice: "tabVoice", appearance: "tabAppearance", usage: "tabUsage", privacy: "tabPrivacy" } as const;
const TAB_LEAD = { models: "modelsLead", teacher: "teacherLead", learning: "learningLead", voice: "voiceLead", appearance: "appearanceLead", usage: "usageLead", privacy: "privacyLead" } as const;
const TAB_KEY = "kuttab.settingsTab";

function initialTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v && (TABS as readonly string[]).includes(v)) return v as Tab;
  } catch {
    // Storage may be blocked; start on the first tab.
  }
  return "models";
}

export function Settings() {
  const t = useT();
  const [tab, setTabState] = useState<Tab>(initialTab);
  const setTab = (next: Tab) => {
    setTabState(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Remembering the tab is only a convenience.
    }
  };

  const panels: Record<Tab, () => ReactNode> = {
    models: () => <ModelsPanel />,
    teacher: () => <TeacherPanel />,
    learning: () => <LearningPanel />,
    voice: () => <VoicePanel />,
    appearance: () => <AppearancePanel />,
    usage: () => <UsagePanel />,
    privacy: () => <PrivacyPanel />,
  };

  return (
    <main className="settings">
      <h1>{t("settings")}</h1>
      <div className="settings-layout">
        <nav className="settings-tabs" role="tablist" aria-orientation="vertical">
          {TABS.map((id) => (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={(e) => {
                const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                const next = TABS[(TABS.indexOf(id) + step + TABS.length) % TABS.length];
                setTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }}
            >
              {t(TAB_LABEL[id])}
            </button>
          ))}
        </nav>
        <section className="settings-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          <p className="muted lead">{t(TAB_LEAD[tab])}</p>
          {panels[tab]()}
        </section>
      </div>
    </main>
  );
}

function ModelsPanel() {
  const t = useT();
  const { settings, updateSettings } = useStore();
  return (
    <>
      <Card>
        <h2>{t("teacherModel")}</h2>
        <ModelPicker role="teacher" value={settings.teacher} onChange={(teacher) => updateSettings({ teacher })} emptyLabel={t("none")} />
      </Card>
      <Card>
        <h2>{t("graderModel")}</h2>
        <ModelPicker role="grader" value={settings.grader} onChange={(grader) => updateSettings({ grader })} emptyLabel={t("sameAsTeacher")} />
      </Card>
      <Card>
        <h2>{t("embedderModel")}</h2>
        <ModelPicker role="embedder" value={settings.embedder} onChange={(embedder) => updateSettings({ embedder })} emptyLabel={t("none")} />
      </Card>

      {(settings.favorites.length > 0 || settings.custom.length > 0) && (
        <Card>
          <h2>{t("customModels")}</h2>
          <ul className="plain">
            {settings.favorites.map((f) => (
              <li key={`f:${f}`} className="row">
                <span dir="ltr">★ {f}</span>
                <button className="link" onClick={() => updateSettings({ favorites: settings.favorites.filter((x) => x !== f) })}>
                  {t("remove")}
                </button>
              </li>
            ))}
            {settings.custom.map((c) => (
              <li key={`c:${modelKey(c)}`} className="row">
                <span dir="ltr">{modelKey(c)}</span>
                <button className="link" onClick={() => updateSettings({ custom: settings.custom.filter((x) => modelKey(x) !== modelKey(c)) })}>
                  {t("remove")}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function TeacherPanel() {
  const t = useT();
  const { settings, updateSettings } = useStore();
  const off = new Set(settings.toolsOff);
  const noTools = !!settings.teacher?.model && !supportsTools(settings.teacher.provider, settings.teacher.model);
  return (
    <>
      <Card>
        <h2>{t("toolsSection")}</h2>
        {noTools && <p className="warn">{t("toolsNote")}</p>}
        {TEACHER_TOOLS.map((tool) => (
          <label key={tool.name} className="inline">
            <input
              type="checkbox"
              checked={!off.has(tool.name)}
              onChange={(e) => updateSettings({ toolsOff: e.target.checked ? settings.toolsOff.filter((n) => n !== tool.name) : [...settings.toolsOff, tool.name] })}
            />
            {t(`tool_${tool.name as ToolName}`)}
          </label>
        ))}
        {!noTools && <p className="muted small">{t("toolsNote")}</p>}
      </Card>
      <Card>
        <h2>{t("tool_run_code")}</h2>
        <label className="inline">
          <input type="checkbox" checked={settings.askBeforeCode} onChange={(e) => updateSettings({ askBeforeCode: e.target.checked })} />
          {t("askBeforeCode")}
        </label>
      </Card>
      <SearchCard />
    </>
  );
}

/** Where researched tracks search the web. Free options first (decision 0002, item 4). */
function SearchCard() {
  const t = useT();
  const { settings, updateSettings } = useStore();
  const { kind, searxngUrl } = settings.search;
  const hasWindow = !!services().platform.web;
  const native = settings.teacher && nativeSearchProvider(settings.teacher.provider);
  const set = (patch: Partial<AppSettings["search"]>) => updateSettings({ search: { ...settings.search, ...patch } });
  const engine = SEARCH_ENGINES.find((e) => e.id === kind);
  return (
    <Card>
      <h2>{t("webSearch")}</h2>
      <label>
        {t("webSearchHow")}
        <select value={kind} onChange={(e) => set({ kind: e.target.value as SearchKind })}>
          <option value="off">{t("searchOff")}</option>
          <option value="browser" disabled={!hasWindow}>
            {t("searchBrowser")}
          </option>
          <option value="native" disabled={!native}>
            {t("searchNative")}
          </option>
          {SEARCH_ENGINES.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      {kind === "browser" && (
        <>
          <p className="muted small">{t("searchBrowserNote")}</p>
          <label className="inline">
            <input type="checkbox" checked={!!settings.search.headless} onChange={(e) => set({ headless: e.target.checked || undefined })} />
            {t("searchHeadless")}
          </label>
        </>
      )}
      {kind === "native" && <p className="muted small">{t("searchNativeNote")}</p>}
      {engine?.id === "searxng" && (
        <label>
          {t("searxngUrl")}
          <input dir="ltr" value={searxngUrl ?? ""} placeholder="http://localhost:8888" onChange={(e) => set({ searxngUrl: e.target.value.trim() || undefined })} />
        </label>
      )}
      {engine?.needsKey && <KeyField provider={engine.id} secretId={searchKeyId(engine.id)} />}
      {engine && (
        <button className="link" onClick={() => void services().platform.openUrl(engine.help)}>
          {t("searchHelp")}
        </button>
      )}
      <p className="muted small">{t("searchAsk")}</p>
    </Card>
  );
}

function LearningPanel() {
  const t = useT();
  const { profile, setProfile, go } = useStore();
  return (
    <Card>
      <h2>{t("aboutYou")}</h2>
      <ProfileForm key={JSON.stringify(profile)} initial={profile} onSave={setProfile} />
      <button className="link" onClick={() => go({ name: "memory" })}>🧠 {t("tutorKnows")}</button>
    </Card>
  );
}

function VoicePanel() {
  const t = useT();
  const { settings, updateSettings } = useStore();
  const v = settings.voice;
  const setVoice = (p: Partial<VoiceSettings>) => updateSettings({ voice: { ...v, ...p } });
  return (
    <Card>
      <h2>{t("speech")}</h2>
      {canSpeak() && (
        <label className="inline">
          <input type="checkbox" checked={settings.tts} onChange={(e) => updateSettings({ tts: e.target.checked })} />
          {t("tts")}
        </label>
      )}
      <label>
        {t("whisper")}
        <select value={settings.whisper} onChange={(e) => updateSettings({ whisper: e.target.value as WhisperSize })}>
          {(Object.keys(WHISPER_SIZE_MB) as WhisperSize[]).map((s) => (
            <option key={s} value={s}>
              {s} · {WHISPER_SIZE_MB[s]} MB
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">{t("whisperNote")}</p>
      <h3>{t("voiceEngine")}</h3>
      <Choice
        name="voice-engine"
        value={v.engine}
        options={[
          ["system", t("voiceSystem")],
          ["piper", t("voicePiper")],
          ["realtime", t("voiceRealtime")],
        ]}
        onChange={(engine) => setVoice({ engine })}
      />
      {v.engine === "realtime" && (
        <>
          <Choice
            name="voice-realtime"
            value={v.realtime}
            options={[
              ["google", "Google Gemini Live"],
              ["openai", "OpenAI Realtime"],
            ]}
            onChange={(realtime) => setVoice({ realtime })}
          />
          <p className="muted small">{t("realtimeNote")}</p>
        </>
      )}
      {v.engine === "piper" && <p className="muted small">{t("piperNote")}</p>}
      <h3>{t("listenMode")}</h3>
      <Choice
        name="voice-listen"
        value={v.listen}
        options={[
          ["hold", t("holdToTalk")],
          ["always", t("listenAlways")],
        ]}
        onChange={(listen) => setVoice({ listen })}
      />
      {v.listen === "always" && <p className="muted small">{t("listenNote")}</p>}
      <h3>{t("dialect")}</h3>
      <select value={v.dialect} onChange={(e) => setVoice({ dialect: e.target.value as VoiceSettings["dialect"] })}>
        {(["msa", "egyptian", "gulf", "levantine", "maghrebi"] as const).map((d) => (
          <option key={d} value={d}>
            {t(`dialect_${d}`)}
          </option>
        ))}
      </select>
      <p className="muted small">{t("dialectNote")}</p>
    </Card>
  );
}

function Choice<V extends string>({ name, value, options, onChange }: { name: string; value: V; options: [V, string][]; onChange: (v: V) => void }) {
  return (
    <div className="choice-row" role="radiogroup">
      {options.map(([v, label]) => (
        <label key={v} className="inline">
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
          {label}
        </label>
      ))}
    </div>
  );
}

function AppearancePanel() {
  const t = useT();
  const { settings, updateSettings } = useStore();
  return (
    <>
      <Card>
        <h2>{t("uiLanguage")}</h2>
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
      </Card>
      <Card>
        <h2>{t("theme")}</h2>
        <Choice<AppSettings["theme"]>
          name="theme"
          value={settings.theme}
          onChange={(theme) => updateSettings({ theme })}
          options={[
            ["system", t("themeSystem")],
            ["light", t("themeLight")],
            ["dark", t("themeDark")],
          ]}
        />
      </Card>
      <Card>
        <h2>{t("textSize")}</h2>
        <Choice<AppSettings["textSize"]>
          name="textSize"
          value={settings.textSize}
          onChange={(textSize) => updateSettings({ textSize })}
          options={[
            ["normal", t("textNormal")],
            ["large", t("textLarge")],
          ]}
        />
      </Card>
    </>
  );
}

function UsagePanel() {
  const t = useT();
  const { settings, session, total, updateSettings } = useStore();
  const priced = [settings.teacher, settings.grader, settings.embedder].filter((c): c is ModelChoice => !!c?.model).filter((c, i, all) => all.findIndex((x) => modelKey(x) === modelKey(c)) === i);
  return (
    <>
      <Card>
        <h2>{t("usage")}</h2>
        <p>
          {t("session")}: <UsageText u={session} />
        </p>
        <p>
          {t("usageTotal")}: <UsageText u={total} />
        </p>
        <button onClick={resetUsage}>{t("resetUsage")}</button>
      </Card>
      <Card>
        <h2>{t("prices")}</h2>
        {priced.length === 0 && <p className="muted">{t("noPrices")}</p>}
        {priced.map((c) => {
          const k = modelKey(c);
          const base = CATALOG.find((m) => modelKey(m) === k);
          const o = settings.prices[k] ?? {};
          const set = (field: "priceIn" | "priceOut", v: string) => {
            const n = v === "" ? undefined : Number(v);
            updateSettings({ prices: { ...settings.prices, [k]: { ...o, [field]: Number.isFinite(n) ? n : undefined } } });
          };
          return (
            <div className="grid3" key={k}>
              <span dir="ltr">{k}</span>
              <label>
                {t("priceIn")}
                <input type="number" min={0} step="0.01" value={o.priceIn ?? ""} placeholder={base?.priceIn?.toString() ?? "?"} onChange={(e) => set("priceIn", e.target.value)} />
              </label>
              <label>
                {t("priceOut")}
                <input type="number" min={0} step="0.01" value={o.priceOut ?? ""} placeholder={base?.priceOut?.toString() ?? "?"} onChange={(e) => set("priceOut", e.target.value)} />
              </label>
            </div>
          );
        })}
      </Card>
    </>
  );
}

function ImportCard() {
  const t = useT();
  const [err, setErr] = useState<string>();
  const onFile = async (f: File | undefined) => {
    setErr(undefined);
    if (!f) return;
    try {
      if (f.size > MAX_BACKUP_BYTES) throw new BackupError("too-big");
      const b = parseBackup(await f.text());
      const when = b.exportedAt ? new Date(b.exportedAt).toLocaleString() : "?";
      if (!confirm(t("importConfirm").replace("{date}", when).replace("{n}", String(Object.keys(b.data).length)))) return;
      await restoreBackup(services().platform.store, b);
      location.reload();
    } catch (e) {
      setErr(e instanceof BackupError ? t(`import_${e.code.replace("-", "_")}` as "import_not_json") : errorText(e));
    }
  };
  return (
    <Card>
      <h2>{t("importAll")}</h2>
      <p className="muted">{t("importNote")}</p>
      <label className="file-button">
        {t("importAll")}
        <input
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {err && <div className="error">{err}</div>}
    </Card>
  );
}

function PrivacyPanel() {
  const t = useT();
  return (
    <>
      <Card>
        <h2>{t("exportAll")}</h2>
        <p className="muted">{t("exportNote")}</p>
        <button
          onClick={async () => {
            const { platform } = services();
            await platform.saveFile(`kuttab-backup-${new Date().toISOString().slice(0, 10)}.json`, await makeBackup(platform.store));
          }}
        >
          {t("exportAll")}
        </button>
      </Card>
      <ImportCard />
      <Card>
        <h2>{t("dataSection")}</h2>
        <p className="muted">{t("dataNote")}</p>
        <button
          className="danger"
          onClick={async () => {
            if (!confirm(t("eraseConfirm"))) return;
            const { platform } = services();
            for (const k of await platform.store.keys()) await platform.store.delete(k);
            for (const p of PROVIDERS) await platform.secrets.delete(keyId(p.id));
            try {
              for (const k of Object.keys(localStorage)) if (k.startsWith("kuttab.")) localStorage.removeItem(k);
            } catch {
              // Storage may be blocked; the store was already cleared.
            }
            location.reload();
          }}
        >
          {t("eraseAll")}
        </button>
      </Card>
    </>
  );
}
