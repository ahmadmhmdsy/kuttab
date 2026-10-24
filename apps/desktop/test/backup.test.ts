import { describe, expect, it } from "vitest";
import { MemoryStore } from "@kuttab/engine";
import { BackupError, makeBackup, parseBackup, restoreBackup } from "../src/backup.ts";

describe("backup", () => {
  it("round-trips the store and replaces what was there", async () => {
    const a = new MemoryStore();
    await a.set("course:1", { title: "Fractions" });
    await a.set("settings", { theme: "dark" });
    const text = await makeBackup(a, new Date("2026-10-18T00:00:00Z"));

    const b = new MemoryStore();
    await b.set("course:old", { title: "Gone" });
    const n = await restoreBackup(b, parseBackup(text));
    expect(n).toBe(2);
    expect((await b.keys()).sort()).toEqual(["course:1", "settings"]);
    expect(await b.get("course:1")).toEqual({ title: "Fractions" });
  });

  it("rejects files that are not a Kuttab backup", () => {
    const code = (s: string) => {
      try {
        parseBackup(s);
      } catch (e) {
        return (e as BackupError).code;
      }
    };
    expect(code("nope")).toBe("not-json");
    expect(code(JSON.stringify({ app: "other", data: {} }))).toBe("not-kuttab");
    expect(code(JSON.stringify({ app: "kuttab", data: [] }))).toBe("not-kuttab");
    expect(code(JSON.stringify({ app: "kuttab", data: { "key:openai": "sk-x" } }))).toBe("has-secret");
  });
});
