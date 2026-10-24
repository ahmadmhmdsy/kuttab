import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { sql } from "@codemirror/lang-sql";
import { python } from "@codemirror/lang-python";

function langExt(mode: string) {
  if (mode === "sql") return [sql()];
  if (mode === "python") return [python()];
  return [];
}

/** CodeMirror editor. Code is always left-to-right, even in an Arabic UI. */
export function CodeEditor({ value, onChange, mode, onRun, readOnly, label }: { value: string; onChange?: (v: string) => void; mode: string; onRun?: () => void; readOnly?: boolean; label?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onRun });
  cb.current = { onChange, onRun };

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      doc: value,
      extensions: [
        keymap.of([{ key: "Mod-Enter", run: () => (cb.current.onRun?.(), true) }]),
        basicSetup,
        ...langExt(mode),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({ "aria-label": label ?? "Code", "aria-multiline": "true" }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cb.current.onChange?.(u.state.doc.toString());
        }),
      ],
    });
    view.current = v;
    return () => v.destroy();
    // Recreated only when the language or editability changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, readOnly]);

  // Outside changes (reset, show solution) replace the document.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return <div className="code-editor" dir="ltr" ref={host} />;
}
