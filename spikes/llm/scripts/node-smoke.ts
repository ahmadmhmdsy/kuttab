// Runs the gateway in plain Node with Node's own fetch: proof that src/gateway
// is platform-neutral. Targets the mock server (scripts/mock-ollama.mjs).
// Run: node scripts/node-smoke.ts [baseURL]   (Node >= 23 strips types natively)
import { runProvider } from "../src/gateway/index.ts";

const baseURL = process.argv[2] ?? "http://127.0.0.1:11434/v1";
const results = await runProvider({ provider: "ollama", model: "mock", baseURL }, globalThis.fetch, () => {});
for (const r of results) console.log(`node-smoke ${r.provider} ${r.check} ${r.status} ${r.detail}`);
process.exit(results.every((r) => r.status === "PASS") ? 0 : 1);
