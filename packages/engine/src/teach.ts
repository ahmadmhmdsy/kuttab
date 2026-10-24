// The teacher: plans, lessons, two-stage grading and grounded answers.
import { z } from "zod";
import { tutorAgent, tutorSystem, type AgentEvent, type AgentOptions } from "./tools.ts";
import type { Hit, KnowledgeBase, Embed } from "@kuttab/kb";
import type { GradeOutcome, LabExercise, LabRegistry } from "@kuttab/labs";
import { languageRule, streamProse, structured, type Ctx } from "./llm.ts";
import { Lesson, Objective, type Block, type Citation, type Lang, type LearnerProfile } from "./schema.ts";
import type { PlanItem } from "./plan.ts";

const TEACHER = `You are Kuttab, a patient, precise teacher. You teach one objective at a time, check understanding often, and never invent facts. When sources are provided, base the lesson on them and cite them as [n].`;

function profileText(p: LearnerProfile): string {
  return `Learner goal: ${p.goal}\nPrior level: ${p.level}\nTime per day: ${p.minutesPerDay} minutes\nPreferred style: ${p.style}${p.notes ? `\nNotes: ${p.notes}` : ""}`;
}

function sourcesText(hits: Hit[]): string {
  return hits.map((h, i) => `[${i + 1}] ${h.source.title}${h.chunk.locator ? ` (${h.chunk.locator})` : ""}\n${h.chunk.text}`).join("\n\n");
}

function citationsFrom(hits: Hit[], used?: number[]): Citation[] {
  return hits
    .map((h, i) => ({ n: i + 1, sourceId: h.source.id, title: h.source.title, locator: h.chunk.locator }))
    .filter((c) => !used || used.includes(c.n));
}

// ---------- Plan ----------

const PlanOut = z.object({
  title: z.string(),
  objectives: z
    .array(z.object({ id: z.string(), title: z.string(), summary: z.string(), prereqs: z.array(z.string()), lab: z.enum(["none", "sql", "python"]) }))
    .min(2)
    .max(16),
});

export async function generatePlan(ctx: Ctx, profile: LearnerProfile, topic: string, hits: Hit[] = []): Promise<{ title: string; objectives: Objective[] }> {
  const out = await structured(
    ctx,
    "teacher",
    "learning plan",
    PlanOut,
    `${TEACHER}\n${languageRule(profile.lang)}`,
    `Design a learning plan for the topic: "${topic}".\n${profileText(profile)}\n\nReturn 4 to 10 objectives in a sensible order. Each objective is one focused skill a learner can master in one sitting. Use short kebab-case ASCII ids (for example "select-basics"). "prereqs" lists ids of earlier objectives it needs. Set "lab" to "sql" or "python" when the objective is best practised by writing that code, otherwise "none".${hits.length ? `\n\nBase the plan on these sources:\n${sourcesText(hits)}` : ""}`,
  );
  return { title: out.title, objectives: sanitizeObjectives(out.objectives) };
}

/** Repairs common model slips: bad ids, duplicates, forward or unknown prereqs. */
export function sanitizeObjectives(raw: { id: string; title: string; summary: string; prereqs: string[]; lab?: string }[]): Objective[] {
  const seen = new Map<string, string>();
  const out: Objective[] = [];
  raw.forEach((o, i) => {
    let id = o.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || `objective-${i + 1}`;
    while ([...seen.values()].includes(id)) id = `${id}-${i + 1}`;
    seen.set(o.id, id);
    const prereqs = o.prereqs.map((p) => seen.get(p)).filter((p): p is string => !!p && p !== id);
    out.push({ id, title: o.title, summary: o.summary, prereqs: [...new Set(prereqs)], lab: o.lab && o.lab !== "none" ? o.lab : undefined });
  });
  return out;
}

// ---------- Lesson ----------

// A flat block shape is far easier for small models than a discriminated union.
const BlockOut = z.object({
  type: z.enum(["explain", "example", "check", "exercise", "reflect", "recap"]),
  markdown: z.string().describe("Body text in Markdown (explain, example, recap). Empty otherwise."),
  code: z.string().describe("Example code, or the exercise starter code. Empty if none."),
  question: z.string().describe("check: the question. exercise/reflect: the task."),
  choices: z.array(z.string()).describe("check: 3-4 options. Empty otherwise."),
  answer: z.number().int().describe("check: index of the correct choice. -1 otherwise."),
  explanation: z.string().describe("check: why the answer is right. reflect: the grading rubric."),
  setup: z.string().describe("exercise: SQL schema and data, or Python helpers. Empty otherwise."),
  solution: z.string().describe("exercise: a correct reference solution. Empty otherwise."),
  tests: z.string().describe("Python exercise: assert statements that check the learner's code. Empty otherwise."),
});
const LessonOut = z.object({ title: z.string(), blocks: z.array(BlockOut).min(3).max(14), cited: z.array(z.number().int()) });

export interface LessonRequest {
  planId: string;
  objective: PlanItem;
  profile: LearnerProfile;
  lang: Lang;
  hits?: Hit[];
  /** Used to drop exercises whose own reference solution fails. */
  labs?: LabRegistry;
  modelName?: string;
}

export async function generateLesson(ctx: Ctx, req: LessonRequest): Promise<Lesson> {
  const { objective: o, profile, lang, hits = [] } = req;
  const lab = o.lab && req.labs?.has(o.lab) ? o.lab : undefined;
  const out = await structured(
    ctx,
    "teacher",
    "lesson",
    LessonOut,
    `${TEACHER}\n${languageRule(lang)}`,
    `Write a lesson for the objective "${o.title}": ${o.summary}\n${profileText(profile)}\n\nUse this block sequence: explain, example, check, ${lab ? "exercise, " : "reflect, "}check, recap. Keep each explain block under 180 words. Checks are multiple choice with exactly one correct answer and plausible wrong options.${
      lab === "sql"
        ? `\nThe exercise is SQL (SQLite). Put CREATE TABLE and INSERT statements in "setup" (5-10 rows), the task in "question", and a SELECT that answers it in "solution". The learner's result must equal the solution's result.`
        : lab === "python"
          ? `\nThe exercise is Python 3. The task asks the learner to define a function. Put a correct definition in "solution" and 3-5 assert statements that call it in "tests". Do not use input(), files or the network.`
          : ""
    }${hits.length ? `\n\nTeach from these sources and cite them inline as [n]. List the numbers you cited in "cited".\n${sourcesText(hits)}` : `\nSet "cited" to [].`}`,
  );
  const blocks: Block[] = [];
  let n = 0;
  for (const b of out.blocks) {
    n++;
    const bid = `${o.id}-${n}`;
    switch (b.type) {
      case "explain":
      case "recap":
        if (b.markdown.trim()) blocks.push({ type: b.type, markdown: b.markdown });
        break;
      case "example":
        blocks.push({ type: "example", markdown: b.markdown, code: b.code || undefined, language: lab });
        break;
      case "check":
        if (b.choices.length >= 2 && b.answer >= 0 && b.answer < b.choices.length)
          blocks.push({ type: "check", id: bid, question: b.question, choices: b.choices, answer: b.answer, explanation: b.explanation });
        break;
      case "reflect":
        blocks.push({ type: "reflect", id: bid, prompt: b.question, rubric: b.explanation });
        break;
      case "exercise": {
        if (!lab || !b.solution.trim()) break;
        const ex: LabExercise = {
          id: bid,
          language: lab,
          prompt: b.question,
          starter: b.code || undefined,
          setup: b.setup || undefined,
          solution: b.solution,
          check: lab === "python" ? { kind: "tests", code: b.tests } : { kind: "result" },
        };
        if (lab === "python" && !b.tests.trim()) break;
        if (await selfCheck(req.labs!, ex)) blocks.push({ type: "exercise", exercise: ex });
        break;
      }
    }
  }
  if (!blocks.length) throw new Error("The model returned an empty lesson");
  return Lesson.parse({
    objectiveId: o.id,
    title: out.title,
    lang,
    blocks,
    citations: hits.length ? citationsFrom(hits, out.cited.length ? out.cited : undefined) : undefined,
    generatedBy: req.modelName,
  });
}

/** A generated exercise is kept only if its reference solution passes its own check. */
export async function selfCheck(labs: LabRegistry, ex: LabExercise): Promise<boolean> {
  try {
    return (await labs.get(ex.language).grade(ex, ex.solution)).passed;
  } catch {
    return false;
  }
}

// ---------- Grading (stage 2) ----------

/** Stage 2: explains a stage-1 outcome. Never changes the verdict. */
export function explainOutcome(ctx: Ctx, ex: LabExercise, code: string, outcome: GradeOutcome, lang: Lang): AsyncGenerator<string> {
  const expected = outcome.expected === undefined ? "" : `\nExpected result: ${JSON.stringify(outcome.expected).slice(0, 1500)}`;
  return streamProse(
    ctx,
    "grader",
    "feedback",
    `You are a kind code tutor. The automatic checker has already decided the verdict; do not contradict it. ${languageRule(lang)}`,
    `Exercise: ${ex.prompt}\nLearner's ${ex.language} code:\n\`\`\`\n${code}\n\`\`\`\nVerdict: ${outcome.passed ? "PASSED" : "FAILED"} (${outcome.reason})\nOutput: ${outcome.output.stdout.slice(0, 800)}${outcome.output.error ? `\nError: ${outcome.output.error}` : ""}${expected}\n\n${
      outcome.passed
        ? "In 2-3 sentences, say what the learner did well and mention one way to make it cleaner, if any."
        : "In 3-5 sentences, explain what is wrong and give one concrete hint. Do not give the full solution."
    }`,
  );
}

const ReflectOut = z.object({ passed: z.boolean(), feedback: z.string() });

/** Free-response grading against an author rubric (non-coding topics). */
export async function gradeReflection(ctx: Ctx, prompt: string, rubric: string, answer: string, lang: Lang): Promise<{ passed: boolean; feedback: string }> {
  if (answer.trim().length < 3) return { passed: false, feedback: "" };
  return structured(
    ctx,
    "grader",
    "reflection grade",
    ReflectOut,
    `You grade short written answers fairly against a rubric. ${languageRule(lang)}`,
    `Task: ${prompt}\nRubric: ${rubric}\nLearner answer: ${answer}\n\nSet "passed" to true only if the answer meets the rubric. Give 2-4 sentences of feedback.`,
  );
}

// ---------- Grounded answers ----------

export interface GroundedAnswer {
  answer: string;
  refused: boolean;
  citations: Citation[];
}

const AskOut = z.object({ answerable: z.boolean(), answer: z.string(), cited: z.array(z.number().int()) });

/** Minimum share of query terms that must appear in the retrieved text. */
export const REFUSAL_COVERAGE = 0.5;

export async function askGrounded(ctx: Ctx, kb: KnowledgeBase, question: string, lang: Lang, embed?: Embed): Promise<GroundedAnswer> {
  const hits = await kb.search(question, 5, embed);
  const refusal = lang === "ar" ? "لا أجد إجابة عن هذا السؤال في مصادرك." : "I can't find this in your sources.";
  if (!hits.length || (!embed && kb.coverage(question, hits) < REFUSAL_COVERAGE)) return { answer: refusal, refused: true, citations: [] };
  const out = await structured(
    ctx,
    "teacher",
    "grounded answer",
    AskOut,
    `Answer only from the numbered sources. Cite every claim as [n]. If the sources do not contain the answer, set "answerable" to false. ${languageRule(lang)}`,
    `Sources:\n${sourcesText(hits)}\n\nQuestion: ${question}`,
  );
  const cited = [...new Set(out.cited.length ? out.cited : [...out.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))].filter((n) => n >= 1 && n <= hits.length);
  if (!out.answerable || !cited.length) return { answer: refusal, refused: true, citations: [] };
  return { answer: out.answer, refused: false, citations: citationsFrom(hits, cited) };
}

/** Open tutor chat about the current lesson. */
function tutorPrompt(lessonTitle: string, lessonText: string, history: { role: "user" | "tutor"; text: string }[]): string {
  const convo = history.map((m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.text}`).join("\n");
  return `Current lesson: ${lessonTitle}\n${lessonText.slice(0, 4000)}\n\nConversation:\n${convo}\nTutor:`;
}

export function tutorReply(ctx: Ctx, lessonTitle: string, lessonText: string, history: { role: "user" | "tutor"; text: string }[], lang: Lang): AsyncGenerator<string> {
  return streamProse(ctx, "teacher", "tutor", tutorSystem(TEACHER, lang), tutorPrompt(lessonTitle, lessonText, history));
}

/** The tutor with teacher tools (T-12). Pass no tools for plain chat with the same events. */
export function tutorAgentReply(
  ctx: Ctx,
  lessonTitle: string,
  lessonText: string,
  history: { role: "user" | "tutor"; text: string }[],
  lang: Lang,
  opts: AgentOptions,
): AsyncGenerator<AgentEvent> {
  return tutorAgent(ctx, tutorSystem(TEACHER, lang), tutorPrompt(lessonTitle, lessonText, history), opts);
}

export function lessonPlainText(l: Lesson): string {
  return l.blocks
    .map((b) => {
      switch (b.type) {
        case "explain":
        case "recap":
          return b.markdown;
        case "example":
          return `${b.markdown}\n${b.code ?? ""}`;
        case "check":
          return `Q: ${b.question}`;
        case "exercise":
          return `Exercise: ${b.exercise.prompt}`;
        case "reflect":
          return `Task: ${b.prompt}`;
      }
    })
    .join("\n\n");
}
