// Teacher tools (ADR 0001). Each tool is a built-in plugin: a name, a zod input,
// and either a `run` (the result goes back to the model) or a `widget` flag (the
// app draws the input in the chat). The registry is plain data, so Settings can
// switch tools on and off without touching the agent loop.
import { stepCountIs, streamText, tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Ctx } from "./llm.ts";
import { languageRule } from "./llm.ts";
import type { Lang } from "./schema.ts";

export interface TeacherTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: S;
  /** Widget tools are drawn by the app; the model is told they were shown. */
  widget?: boolean;
  /** Data tools run here and return text for the model. */
  run?: (input: z.infer<S>, host: ToolHost) => Promise<string>;
}

export function defineTool<S extends z.ZodType>(t: TeacherTool<S>): TeacherTool<S> {
  return t;
}

/** What the app lends to data tools. Every field is optional; a missing one disables that tool. */
export interface ToolHost {
  searchSources?: (query: string) => Promise<{ title: string; text: string }[]>;
  rememberFact?: (fact: string) => Promise<void>;
}

const chart = defineTool({
  name: "show_chart",
  description: "Draw a small bar or line chart for the learner. Use it when numbers are easier to compare as a picture.",
  widget: true,
  input: z.object({
    title: z.string(),
    kind: z.enum(["bar", "line"]),
    labels: z.array(z.string()).min(1).max(24),
    series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).min(1).max(4),
  }),
});

const diagram = defineTool({
  name: "show_diagram",
  description: "Draw a diagram from Mermaid source (flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, mindmap). Use it for processes, structures and relationships.",
  widget: true,
  input: z.object({ title: z.string(), mermaid: z.string().max(4000) }),
});

const math = defineTool({
  name: "show_math",
  description: "Typeset a formula with LaTeX (KaTeX subset). Use it for any equation longer than a few symbols.",
  widget: true,
  input: z.object({ latex: z.string().max(2000), display: z.boolean().default(true) }),
});

const quiz = defineTool({
  name: "quiz_card",
  description: "Ask one multiple-choice check question. The learner answers inside the chat and the answer comes back as their next message.",
  widget: true,
  input: z.object({
    question: z.string(),
    choices: z.array(z.string()).min(2).max(5),
    answer: z.number().int().min(0),
    explanation: z.string(),
  }),
});

const code = defineTool({
  name: "run_code",
  description: "Show a short runnable example. The learner can run it in the app's sandbox (Python, or SQL on SQLite) and see the output.",
  widget: true,
  input: z.object({ language: z.enum(["python", "sql"]), code: z.string().max(4000) }),
});

const sources = defineTool({
  name: "lookup_sources",
  description: "Search the learner's own documents and the course material. Cite the titles you use.",
  input: z.object({ query: z.string() }),
  run: async ({ query }, host) => {
    const hits = (await host.searchSources?.(query)) ?? [];
    if (!hits.length) return "No matching passages.";
    return hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.text.slice(0, 800)}`).join("\n\n");
  },
});

const remember = defineTool({
  name: "remember_learner_fact",
  description: "Save one short, durable fact about the learner (a goal, a preference, a recurring mistake) so later lessons can use it. Never save secrets or personal identifiers.",
  input: z.object({ fact: z.string().max(200) }),
  run: async ({ fact }, host) => {
    await host.rememberFact?.(fact);
    return "Saved.";
  },
});

export const TEACHER_TOOLS: TeacherTool[] = [chart, diagram, math, quiz, code, sources, remember];
export type ToolName = "show_chart" | "show_diagram" | "show_math" | "quiz_card" | "run_code" | "lookup_sources" | "remember_learner_fact";

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "widget"; name: string; input: unknown }
  | { type: "tool"; name: string; ok: boolean };

function toolSet(enabled: TeacherTool[], host: ToolHost, onWidget: (name: string, input: unknown) => void): ToolSet {
  const set: ToolSet = {};
  for (const t of enabled) {
    if (t.name === "lookup_sources" && !host.searchSources) continue;
    if (t.name === "remember_learner_fact" && !host.rememberFact) continue;
    set[t.name] = tool({
      description: t.description,
      inputSchema: t.input,
      execute: async (input: unknown) => {
        if (t.widget) {
          onWidget(t.name, input);
          return "Shown to the learner.";
        }
        return t.run ? t.run(input, host) : "";
      },
    });
  }
  return set;
}

export interface AgentOptions {
  tools: TeacherTool[];
  host?: ToolHost;
  maxSteps?: number;
}

/**
 * The tutor as an agent: it may call tools between sentences, and widgets are
 * yielded in order with the text around them. With no tools it is plain chat.
 */
export async function* tutorAgent(ctx: Ctx, system: string, prompt: string, opts: AgentOptions): AsyncGenerator<AgentEvent> {
  const queue: AgentEvent[] = [];
  const set = toolSet(opts.tools, opts.host ?? {}, (name, input) => queue.push({ type: "widget", name, input }));
  const names = Object.keys(set);
  const r = streamText({
    model: ctx.teacher,
    instructions: names.length
      ? `${system}\n\nYou can call these tools: ${names.join(", ")}. Use one only when it teaches better than words; keep talking to the learner around it.`
      : system,
    prompt,
    tools: names.length ? set : undefined,
    stopWhen: stepCountIs(opts.maxSteps ?? 4),
    abortSignal: ctx.signal,
    onFinish: ({ totalUsage }) =>
      ctx.onUsage?.({ role: "teacher", task: "tutor", inputTokens: totalUsage.inputTokens, outputTokens: totalUsage.outputTokens }),
  });
  for await (const part of r.fullStream) {
    if (part.type === "text-delta") yield { type: "text", text: part.text };
    else if (part.type === "tool-result") {
      yield* queue.splice(0);
      yield { type: "tool", name: part.toolName, ok: true };
    } else if (part.type === "tool-error") yield { type: "tool", name: part.toolName, ok: false };
    else if (part.type === "error") throw part.error;
  }
  yield* queue.splice(0);
}

export function tutorSystem(teacher: string, lang: Lang): string {
  return `${teacher} Answer briefly (under 150 words) and ask a follow-up question when it helps. ${languageRule(lang)}`;
}
