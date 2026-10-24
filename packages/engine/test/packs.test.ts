// Every sample pack must parse, and every lab exercise in it must be honest:
// the reference solution passes its own check and each known-wrong answer fails.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeLabs } from "@kuttab/labs/node";
import { parsePack, type Block } from "../src/index.ts";

const dir = join(import.meta.dirname, "../../../packs");
const files = readdirSync(dir).filter((f) => f.endsWith(".kuttab"));
const labs = createNodeLabs();

describe("sample packs", () => {
  it("ships packs", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const pack = parsePack(readFileSync(join(dir, file), "utf8"));
      const blocks: Block[] = pack.lessons.flatMap((l) => l.blocks);

      it("is well formed", () => {
        expect(`${pack.id}.kuttab`).toBe(file);
        for (const l of pack.lessons) expect(l.lang).toBe(pack.lang);
        const ids = new Set<string>();
        for (const b of blocks) {
          const id = b.type === "check" || b.type === "reflect" ? b.id : b.type === "exercise" ? b.exercise.id : undefined;
          if (!id) continue;
          expect(ids.has(id), `duplicate block id ${id}`).toBe(false);
          ids.add(id);
          if (b.type === "check") expect(b.answer).toBeLessThan(b.choices.length);
        }
        for (const o of pack.objectives) expect(pack.lessons.some((l) => l.objectiveId === o.id), `lesson for ${o.id}`).toBe(true);
      });

      for (const b of blocks) {
        if (b.type !== "exercise") continue;
        const ex = b.exercise;
        it(`exercise ${ex.id}: solution passes, wrong answers fail`, async () => {
          const rt = labs.get(ex.language);
          const ok = await rt.grade(ex, ex.solution);
          expect(ok.passed, `solution: ${ok.reason}`).toBe(true);
          expect(ex.wrong?.length ?? 0, "needs at least one wrong answer").toBeGreaterThan(0);
          for (const w of ex.wrong ?? []) {
            const r = await rt.grade(ex, w);
            expect(r.passed, `wrong answer passed: ${w}`).toBe(false);
          }
        });
      }
    });
  }
});
