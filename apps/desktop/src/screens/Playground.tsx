// Free practice in any registered lab runtime.
import { useState } from "react";
import type { RunOutput } from "@kuttab/labs";
import { useT } from "../i18n.ts";
import { services } from "../state.ts";
import { errorText } from "../ai.ts";
import { CodeEditor } from "../components/CodeEditor.tsx";
import { RunOutputView, Spinner } from "../components/common.tsx";

const STARTERS: Record<string, string> = {
  sql: "CREATE TABLE t(name TEXT, score INT);\nINSERT INTO t VALUES ('Huda', 91), ('Omar', 78);\nSELECT * FROM t ORDER BY score DESC;",
  python: 'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("Kuttab"))',
};

export function Playground() {
  const t = useT();
  const labs = services().labs.list();
  const [lang, setLang] = useState(labs[0]?.language ?? "sql");
  const [code, setCode] = useState<Record<string, string>>(STARTERS);
  const [out, setOut] = useState<RunOutput>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const run = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      setOut(await services().labs.get(lang).run(code[lang] ?? "", {}));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="playground">
      <h1>{t("playground")}</h1>
      <p className="muted">{t("playgroundHelp")}</p>
      <div className="row">
        <label>
          {t("language")}{" "}
          <select
            value={lang}
            onChange={(e) => {
              setLang(e.target.value);
              setOut(undefined);
            }}
          >
            {labs.map((l) => (
              <option key={l.language} value={l.language}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={run} disabled={busy}>
          {t("run")}
        </button>
        {busy && <Spinner />}
      </div>
      <CodeEditor key={lang} value={code[lang] ?? ""} onChange={(v) => setCode((c) => ({ ...c, [lang]: v }))} mode={lang} onRun={run} />
      {err && <div className="error">{err}</div>}
      {out && <RunOutputView out={out} />}
    </main>
  );
}
