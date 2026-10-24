// The lab-runtime contract. Every language (SQL, Python, and any added later)
// implements LabRuntime; the engine and UI only ever see this interface.

export interface ResultSet {
  columns: string[];
  rows: unknown[][];
}

export interface RunOutput {
  ok: boolean;
  stdout: string;
  /** Learner-facing error text (trimmed traceback / SQL error). */
  error?: string;
  /** Result sets produced (SQL); empty for languages without tables. */
  tables: ResultSet[];
  timedOut?: boolean;
  ms: number;
}

/** How an exercise decides pass or fail. Always deterministic. */
export type LabCheck =
  /** SQL: learner's final result set must equal the reference solution's. With
   * `verify`, both are run first and the verify query's results are compared
   * (for INSERT/UPDATE/DELETE exercises). */
  | { kind: "result"; ordered?: boolean; verify?: string }
  /** Python: `code` (asserts) runs in the same namespace after the learner code. */
  | { kind: "tests"; code: string }
  /** Any language: trimmed stdout must equal `expected`. */
  | { kind: "stdout"; expected: string };

export interface LabExercise {
  id: string;
  language: string;
  prompt: string;
  starter?: string;
  /** Runs before the learner's code (schema + data for SQL, helpers for Python). */
  setup?: string;
  /** Reference solution. Must pass its own check (S3). */
  solution: string;
  /** Known-wrong solutions. Each must fail the check (S3). */
  wrong?: string[];
  check: LabCheck;
  hints?: string[];
}

export interface GradeOutcome {
  passed: boolean;
  /** Short deterministic reason, e.g. "Row 2 differs". Stage 2 (LLM) explains further. */
  reason: string;
  output: RunOutput;
  expected?: ResultSet | string;
}

export interface RunOptions {
  setup?: string;
  timeoutMs?: number;
}

/** Low-level executor: runs code once, in a fresh environment, and reports. */
export type Executor = (code: string, opts: RunOptions & { after?: string }) => Promise<RunOutput>;

export interface LabRuntime {
  readonly language: string;
  readonly label: string;
  /** CodeMirror language hint for the editor. */
  readonly editorMode: string;
  run(code: string, opts?: RunOptions): Promise<RunOutput>;
  grade(ex: LabExercise, code: string, opts?: { timeoutMs?: number }): Promise<GradeOutcome>;
  dispose?(): void;
}

export const DEFAULT_TIMEOUT_MS = 8000;
