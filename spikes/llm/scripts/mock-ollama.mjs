// A stand-in for Ollama on localhost:11434, for when Ollama is not installed.
// It implements just enough of Ollama's API (/api/version and the OpenAI-compatible
// /v1/chat/completions, streamed and not) to exercise the localhost path through
// tauri-plugin-http. Results against it are MOCK results, not an Ollama verdict.
// It logs each request's Origin header so the Origin behavior can be recorded.
// Run: node scripts/mock-ollama.mjs [port]
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 11434);

const card = { topic: "Python list comprehensions", difficulty: "easy", keyPoints: ["[expr for x in xs]", "optional if-filter"] };

function chunk(id, delta, finish = null) {
  return `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 0, model: "mock", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
}

createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", async () => {
    console.log(`[mock-ollama] ${req.method} ${req.url} origin=${JSON.stringify(req.headers.origin ?? null)}`);
    if (req.url === "/api/version") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ version: "mock-0.0.0" }));
    }
    if (req.url === "/v1/chat/completions" && req.method === "POST") {
      const json = JSON.parse(body || "{}");
      const id = "chatcmpl-mock";
      if (json.stream) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(chunk(id, { role: "assistant", content: "" }));
        for (const n of ["1\n", "2\n", "3\n", "4\n", "5"]) {
          res.write(chunk(id, { content: n }));
          await new Promise((r) => setTimeout(r, 60));
        }
        res.write(chunk(id, {}, "stop"));
        return res.end("data: [DONE]\n\n");
      }
      const isObject = json.response_format?.type === "json_schema" || json.response_format?.type === "json_object";
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({
        id, object: "chat.completion", created: 0, model: "mock",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: isObject ? JSON.stringify(card) : "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }));
    }
    res.writeHead(404).end();
  });
}).listen(port, "127.0.0.1", () => console.log(`[mock-ollama] listening on 127.0.0.1:${port}`));
