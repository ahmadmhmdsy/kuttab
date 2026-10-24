import { gradeWith } from "./grade.ts";
import { DEFAULT_TIMEOUT_MS, type Executor, type LabRuntime } from "./types.ts";

export interface RuntimeSpec {
  language: string;
  label: string;
  editorMode: string;
  exec: Executor;
  dispose?: () => void;
}

/** Builds a LabRuntime from any executor; grading logic is shared. */
export function createRuntime(spec: RuntimeSpec): LabRuntime {
  return {
    language: spec.language,
    label: spec.label,
    editorMode: spec.editorMode,
    run: (code, opts = {}) => spec.exec(code, { timeoutMs: DEFAULT_TIMEOUT_MS, ...opts }),
    grade: (ex, code, opts = {}) => gradeWith(spec.exec, ex, code, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    dispose: spec.dispose,
  };
}
