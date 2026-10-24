// Picks a provider and model for one role. Offers the curated catalog, the
// learner's favorites and custom list, and any id the provider reports.
import { useEffect, useId, useState } from "react";
import { CATALOG, PROVIDERS, canMakeImages, providerInfo, type Role } from "@kuttab/llm-gateway";
import { useT } from "../i18n.ts";
import { modelKey, services, useStore, type ModelChoice } from "../state.ts";
import { discoverModels, drawImage, errorText, keyId, testModel } from "../ai.ts";
import { hasWebGpu, webLlmModels } from "../platform/webllm.ts";

export function ModelPicker({ role, value, onChange, emptyLabel }: { role: Role; value?: ModelChoice; onChange: (v?: ModelChoice) => void; emptyLabel: string }) {
  const t = useT();
  const listId = useId();
  const { favorites, custom, baseURLs } = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [found, setFound] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();
  const [busy, setBusy] = useState(false);

  const providers = PROVIDERS.filter((p) => (role === "embedder" ? p.embeddings : role === "image" ? canMakeImages(p.id) : true));
  const info = value ? providerInfo(value.provider) : undefined;

  useEffect(() => {
    setFound([]);
    setStatus(undefined);
    if (value?.provider === "webllm") void webLlmModels().then((m) => setFound(m.map((x) => x.id)));
  }, [value?.provider]);

  const options = value
    ? [
        ...favorites.filter((f) => f.startsWith(`${value.provider}:`)).map((f) => ({ id: f.slice(value.provider.length + 1), label: `★ ${f.slice(value.provider.length + 1)}` })),
        ...CATALOG.filter((m) => m.provider === value.provider && m.roles.includes(role)).map((m) => ({ id: m.model, label: `${m.label}${m.note ? ` — ${m.note}` : ""}` })),
        ...custom.filter((c) => c.provider === value.provider).map((c) => ({ id: c.model, label: c.model })),
        ...found.map((id) => ({ id, label: id })),
      ].filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i)
    : [];

  const setProvider = (id: string) => {
    if (!id) return onChange(undefined);
    const first = CATALOG.find((m) => m.provider === id && m.roles.includes(role));
    onChange({ provider: id, model: first?.model ?? "" });
  };

  const cat = value && CATALOG.find((m) => m.provider === value.provider && m.model === value.model);
  const fav = value?.model ? favorites.includes(modelKey(value)) : false;

  return (
    <div className="model-picker">
      <div className="grid2">
        <label>
          {t("provider")}
          <select value={value?.provider ?? ""} onChange={(e) => setProvider(e.target.value)}>
            <option value="">{emptyLabel}</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.kind !== "cloud" ? ` · ${t("localOnly")}` : ""}
              </option>
            ))}
          </select>
        </label>
        {value && (
          <label>
            {t("model")}
            <div className="row tight">
              <input list={listId} value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value.trim() })} placeholder={t("anyModel")} dir="ltr" />
              <button
                className="icon"
                title={t("favorites")}
                aria-pressed={fav}
                disabled={!value.model}
                onClick={() => updateSettings({ favorites: fav ? favorites.filter((f) => f !== modelKey(value)) : [...favorites, modelKey(value)] })}
              >
                {fav ? "★" : "☆"}
              </button>
            </div>
            <datalist id={listId}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </datalist>
          </label>
        )}
      </div>
      {value && info && (
        <>
          {cat && (
            <p className="muted small">
              {t("arabicQuality")}: {cat.arabic}
              {cat.priceIn !== undefined && ` · $${cat.priceIn} / $${cat.priceOut} per 1M`}
            </p>
          )}
          {value.provider === "webllm" && !hasWebGpu() && <p className="warn">{t("webgpuMissing")}</p>}
          {(info.kind === "local" || info.id === "custom") && (
            <label>
              {t("baseUrl")}
              <input
                dir="ltr"
                value={baseURLs[info.id] ?? ""}
                placeholder={info.baseURL || "https://…/v1"}
                onChange={(e) => updateSettings({ baseURLs: { ...baseURLs, [info.id]: e.target.value.trim() } })}
              />
            </label>
          )}
          {(info.needsKey || info.id === "custom") && <KeyField provider={info.id} />}
          <div className="row">
            {role !== "embedder" && (
              <button
                disabled={busy || !value.model}
                onClick={async () => {
                  setBusy(true);
                  setStatus(undefined);
                  try {
                    if (role === "image") {
                      await drawImage("A small red circle on white", { aspectRatio: "1:1" }, value);
                      setStatus({ ok: true, text: t("testOk") });
                    } else {
                      const reply = await testModel(value);
                      setStatus({ ok: true, text: `${t("testOk")} “${reply.slice(0, 40)}”` });
                    }
                  } catch (e) {
                    setStatus({ ok: false, text: errorText(e) });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? t("testing") : t("test")}
              </button>
            )}
            {value.provider !== "webllm" && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setStatus(undefined);
                  try {
                    setFound(await discoverModels(value.provider));
                  } catch (e) {
                    setStatus({ ok: false, text: errorText(e) });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("discover")}
              </button>
            )}
            {value.model && !custom.some((c) => modelKey(c) === modelKey(value)) && !CATALOG.some((m) => modelKey(m) === modelKey(value)) && (
              <button onClick={() => updateSettings({ custom: [...custom, { provider: value.provider, model: value.model }] })}>{t("addCustom")}</button>
            )}
            {info.help && (
              <button className="link" onClick={() => void services().platform.openUrl(info.help)}>
                {info.needsKey ? t("getKey") : t("install")} ↗
              </button>
            )}
          </div>
          {found.length > 0 && (
            <p className="muted small">
              {t("modelsFound", { n: found.length })} · {t("anyModel")}
            </p>
          )}
          {status && <p className={status.ok ? "ok" : "err"}>{status.text}</p>}
        </>
      )}
    </div>
  );
}

/** `secretId` stores the key under another name (search APIs use their own keys). */
export function KeyField({ provider, secretId = keyId(provider) }: { provider: string; secretId?: string }) {
  const t = useT();
  const secrets = services().platform.secrets;
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    void secrets.get(secretId).then((k) => setSaved(!!k));
  }, [secretId, secrets]);
  return (
    <div className="key-field">
      <label>
        {t("apiKey")}
        <div className="row tight">
          <input type="password" autoComplete="off" dir="ltr" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={saved ? t("apiKeySaved") : "sk-…"} />
          <button
            disabled={!draft.trim()}
            onClick={async () => {
              await secrets.set(secretId, draft.trim());
              setDraft("");
              setSaved(true);
            }}
          >
            {t("saveKey")}
          </button>
          {saved && (
            <button
              onClick={async () => {
                await secrets.delete(secretId);
                setSaved(false);
              }}
            >
              {t("removeKey")}
            </button>
          )}
        </div>
      </label>
      <p className="muted small">{secrets.persistent ? t("apiKeyKeychain") : t("apiKeyMemory")}</p>
    </div>
  );
}
