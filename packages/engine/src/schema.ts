// The `.kuttab` course-pack format and the shapes the engine passes around.
// A pack is a single UTF-8 JSON document. It is open: anyone can author one by
// hand, and the app can export any course the learner built.
import { z } from "zod";

export const Lang = z.enum(["en", "ar"]);
export type Lang = z.infer<typeof Lang>;

export const LabCheckSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("result"), ordered: z.boolean().optional(), verify: z.string().optional() }),
  z.object({ kind: z.literal("tests"), code: z.string() }),
  z.object({ kind: z.literal("stdout"), expected: z.string() }),
]);

export const LabExerciseSchema = z.object({
  id: z.string().min(1),
  language: z.string().min(1),
  prompt: z.string().min(1),
  starter: z.string().optional(),
  setup: z.string().optional(),
  solution: z.string().min(1),
  wrong: z.array(z.string()).optional(),
  check: LabCheckSchema,
  hints: z.array(z.string()).optional(),
});

export const Block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("explain"), markdown: z.string() }),
  z.object({ type: z.literal("example"), markdown: z.string(), code: z.string().optional(), language: z.string().optional() }),
  z.object({
    type: z.literal("check"),
    id: z.string(),
    question: z.string(),
    choices: z.array(z.string()).min(2).max(6),
    answer: z.number().int().min(0),
    explanation: z.string(),
  }),
  z.object({ type: z.literal("exercise"), exercise: LabExerciseSchema }),
  /** Free-response task graded by the LLM against a rubric (non-coding topics). */
  z.object({ type: z.literal("reflect"), id: z.string(), prompt: z.string(), rubric: z.string() }),
  z.object({ type: z.literal("recap"), markdown: z.string() }),
]);
export type Block = z.infer<typeof Block>;

export const Citation = z.object({ n: z.number().int(), sourceId: z.string(), title: z.string(), locator: z.string().optional() });
export type Citation = z.infer<typeof Citation>;

export const Lesson = z.object({
  objectiveId: z.string(),
  title: z.string(),
  lang: Lang,
  blocks: z.array(Block).min(1),
  citations: z.array(Citation).optional(),
  /** Model that wrote it, or "author" for hand-written pack lessons. */
  generatedBy: z.string().optional(),
});
export type Lesson = z.infer<typeof Lesson>;

export const Objective = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "objective ids are kebab-case"),
  title: z.string(),
  summary: z.string(),
  prereqs: z.array(z.string()).default([]),
  /** Lab language this objective practises, if any. */
  lab: z.string().optional(),
});
export type Objective = z.infer<typeof Objective>;

export const PackSource = z.object({ id: z.string(), title: z.string(), markdown: z.string() });

export const Pack = z.object({
  format: z.literal("kuttab"),
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  title: z.string(),
  description: z.string(),
  lang: Lang,
  author: z.string().optional(),
  license: z.string().optional(),
  objectives: z.array(Objective).min(1),
  lessons: z.array(Lesson).default([]),
  /** Reference text for grounded answers, indexed into the knowledge base on import. */
  sources: z.array(PackSource).default([]),
});
export type Pack = z.infer<typeof Pack>;
export type PackInput = z.input<typeof Pack>;

export const LearnerProfile = z.object({
  name: z.string().optional(),
  lang: Lang,
  goal: z.string(),
  level: z.enum(["new", "some", "experienced"]),
  minutesPerDay: z.number().int().min(5).max(240),
  style: z.enum(["examples-first", "theory-first", "practice-first"]).default("examples-first"),
  notes: z.string().optional(),
});
export type LearnerProfile = z.infer<typeof LearnerProfile>;
