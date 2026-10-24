import { describe, expect, it } from "vitest";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { TEACHER_TOOLS, tutorAgentReply, type AgentEvent } from "../src/index.ts";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

// Each reply is one model step: text, then optional tool calls.
function agentModel(...steps: { text?: string; calls?: { name: string; input: unknown }[] }[]) {
  const queue = [...steps];
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const s = queue.shift() ?? { text: "" };
      const chunks: unknown[] = [{ type: "stream-start", warnings: [] }];
      if (s.text) chunks.push({ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: s.text }, { type: "text-end", id: "t" });
      (s.calls ?? []).forEach((c, i) => chunks.push({ type: "tool-call", toolCallId: `c${i}`, toolName: c.name, input: JSON.stringify(c.input) }));
      const reason = s.calls?.length ? "tool-calls" : "stop";
      chunks.push({ type: "finish", finishReason: { unified: reason, raw: reason }, usage });
      return { stream: simulateReadableStream({ chunks: chunks as never[] }) };
    },
  });
  return model;
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const chart = { title: "Rows", kind: "bar", labels: ["a", "b"], series: [{ name: "n", values: [1, 2] }] };

describe("teacher agent", () => {
  it("yields widgets in order with the text around them", async () => {
    const model = agentModel({ text: "Look: ", calls: [{ name: "show_chart", input: chart }] }, { text: "Bars compare counts." });
    const used: number[] = [];
    const ev = await collect(
      tutorAgentReply({ teacher: model, onUsage: (u) => used.push(u.inputTokens ?? 0) }, "SELECT", "text", [{ role: "user", text: "show me" }], "en", { tools: TEACHER_TOOLS }),
    );
    expect(ev.map((e) => e.type)).toEqual(["text", "widget", "tool", "text"]);
    expect(ev[1]).toEqual({ type: "widget", name: "show_chart", input: chart });
    expect(used).toEqual([20]);
    // The model was told about the tools and got the widget's result back.
    const second = model.doStreamCalls[1];
    expect(JSON.stringify(second.prompt)).toContain("Shown to the learner.");
    expect(model.doStreamCalls[0].tools?.map((t) => t.name)).toContain("show_diagram");
  });

  it("runs data tools through the host and leaves out tools the host cannot serve", async () => {
    const model = agentModel({ calls: [{ name: "lookup_sources", input: { query: "joins" } }] }, { text: "Per [1], joins match rows." });
    const ev = await collect(
      tutorAgentReply({ teacher: model }, "JOIN", "", [], "en", {
        tools: TEACHER_TOOLS,
        host: { searchSources: async (q) => [{ title: "Notes", text: `about ${q}` }] },
      }),
    );
    expect(ev).toContainEqual({ type: "tool", name: "lookup_sources", ok: true });
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain("about joins");
    const offered = model.doStreamCalls[0].tools?.map((t) => t.name) ?? [];
    expect(offered).toContain("lookup_sources");
    expect(offered).not.toContain("remember_learner_fact");
  });

  it("is plain chat with no tools", async () => {
    const model = agentModel({ text: "Hello." });
    const ev = await collect(tutorAgentReply({ teacher: model }, "x", "", [], "en", { tools: [] }));
    expect(ev).toEqual([{ type: "text", text: "Hello." }]);
    expect(model.doStreamCalls[0].tools).toBeUndefined();
  });

  it("reports a bad tool input instead of drawing it", async () => {
    const model = agentModel({ calls: [{ name: "show_chart", input: { title: "x" } }] }, { text: "Sorry." });
    const ev = await collect(tutorAgentReply({ teacher: model }, "x", "", [], "en", { tools: TEACHER_TOOLS }));
    expect(ev.some((e) => e.type === "widget")).toBe(false);
  });
});
