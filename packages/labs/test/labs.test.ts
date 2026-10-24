import { afterAll, describe, expect, it } from "vitest";
import { createNodeLabs } from "../src/node.ts";
import type { LabExercise } from "../src/types.ts";

const labs = createNodeLabs();
afterAll(() => labs.dispose());

const setup = "CREATE TABLE t(id INTEGER, name TEXT, age INTEGER); INSERT INTO t VALUES (1,'Ali',30),(2,'Sara',25),(3,'Omar',41);";

describe("sql runtime", () => {
  const ex: LabExercise = {
    id: "sql-1", language: "sql", prompt: "names over 28, by age", setup,
    solution: "SELECT name FROM t WHERE age > 28 ORDER BY age;",
    check: { kind: "result", ordered: true },
  };
  it("passes the reference and an equivalent query", async () => {
    const rt = labs.get("sql");
    expect((await rt.grade(ex, ex.solution)).passed).toBe(true);
    expect((await rt.grade(ex, "select name as n from t where age >= 29 order by age")).passed).toBe(true);
  });
  it("fails wrong order, wrong rows, and errors", async () => {
    const rt = labs.get("sql");
    const r1 = await rt.grade(ex, "SELECT name FROM t WHERE age > 28 ORDER BY age DESC");
    expect(r1.passed).toBe(false);
    expect(r1.reason).toMatch(/row 1/);
    expect((await rt.grade(ex, "SELECT name FROM t")).passed).toBe(false);
    const r3 = await rt.grade(ex, "SELEC name FROM t");
    expect(r3.passed).toBe(false);
    expect(r3.reason).toMatch(/error/);
  });
  it("verifies state after a write", async () => {
    const w: LabExercise = { id: "sql-2", language: "sql", prompt: "delete Omar", setup, solution: "DELETE FROM t WHERE name='Omar';", check: { kind: "result", verify: "SELECT * FROM t" } };
    const rt = labs.get("sql");
    expect((await rt.grade(w, "DELETE FROM t WHERE id = 3")).passed).toBe(true);
    expect((await rt.grade(w, "DELETE FROM t WHERE id = 2")).passed).toBe(false);
  });
});

describe("python runtime", () => {
  const ex: LabExercise = {
    id: "py-1", language: "python", prompt: "write square(n)",
    solution: "def square(n):\n    return n * n",
    check: { kind: "tests", code: "assert square(3) == 9, 'square(3) should be 9'\nassert square(-2) == 4" },
  };
  it("captures stdout", async () => {
    const out = await labs.get("python").run("print('مرحبا', 1 + 1)");
    expect(out.ok).toBe(true);
    expect(out.stdout.trim()).toBe("مرحبا 2");
  });
  it("grades with tests", async () => {
    const rt = labs.get("python");
    expect((await rt.grade(ex, ex.solution)).passed).toBe(true);
    const bad = await rt.grade(ex, "def square(n):\n    return n + n");
    expect(bad.passed).toBe(false);
    expect(bad.reason).toMatch(/square\(3\) should be 9/);
    const err = await rt.grade(ex, "def square(n) return n");
    expect(err.passed).toBe(false);
    expect(err.reason).toMatch(/SyntaxError/);
  });
  it("grades stdout", async () => {
    const s: LabExercise = { id: "py-2", language: "python", prompt: "print 1..3", solution: "for i in range(1,4): print(i)", check: { kind: "stdout", expected: "1\n2\n3" } };
    expect((await labs.get("python").grade(s, "print(1)\nprint(2)\nprint(3)")).passed).toBe(true);
    expect((await labs.get("python").grade(s, "print(1, 2, 3)")).passed).toBe(false);
  });
});
