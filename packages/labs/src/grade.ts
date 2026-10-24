import { compareResultSets } from "./compare.ts";
import type { Executor, GradeOutcome, LabExercise, ResultSet } from "./types.ts";

const last = (t: ResultSet[]): ResultSet | undefined => t[t.length - 1];

/** Stage 1 grading: deterministic, shared by every runtime. */
export async function gradeWith(exec: Executor, ex: LabExercise, code: string, timeoutMs?: number): Promise<GradeOutcome> {
  const check = ex.check;
  switch (check.kind) {
    case "result": {
      const after = check.verify;
      const [mine, ref] = await Promise.all([
        exec(code, { setup: ex.setup, after, timeoutMs }),
        exec(ex.solution, { setup: ex.setup, after, timeoutMs }),
      ]);
      if (!mine.ok) return { passed: false, reason: mine.timedOut ? "timed out" : `error: ${mine.error}`, output: mine };
      if (!ref.ok) throw new Error(`Reference solution for ${ex.id} failed: ${ref.error}`);
      const got = last(mine.tables);
      const want = last(ref.tables);
      if (!want) throw new Error(`Reference solution for ${ex.id} produced no result set`);
      if (!got) return { passed: false, reason: "your query returned no result set", output: mine, expected: want };
      const cmp = compareResultSets(got, want, check.ordered ?? false);
      return cmp.equal
        ? { passed: true, reason: "result matches", output: mine, expected: want }
        : { passed: false, reason: cmp.reason, output: mine, expected: want };
    }
    case "tests": {
      const out = await exec(code, { setup: ex.setup, after: check.code, timeoutMs });
      if (out.ok) return { passed: true, reason: "all tests passed", output: out };
      return { passed: false, reason: out.timedOut ? "timed out" : (out.error ?? "a test failed"), output: out };
    }
    case "stdout": {
      const out = await exec(code, { setup: ex.setup, timeoutMs });
      if (!out.ok) return { passed: false, reason: out.timedOut ? "timed out" : `error: ${out.error}`, output: out, expected: check.expected };
      const ok = out.stdout.trim().replace(/\r\n/g, "\n") === check.expected.trim();
      return { passed: ok, reason: ok ? "output matches" : "output differs from expected", output: out, expected: check.expected };
    }
  }
}
