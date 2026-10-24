# spikes/llm — T-3: LLM gateway spike

This is a throwaway M0 spike, not product code. It answers one question: can the
Vercel AI SDK, running inside a Tauri 2 WebView, reach OpenAI, Anthropic and a
local Ollama server through `tauri-plugin-http` (so browser CORS never applies),
with streamed text and `generateObject` both working?

Results and evidence are in [RESULTS.md](RESULTS.md).

## Layout

| path | role |
|---|---|
| `src/gateway/` | platform-neutral: provider factory + checks. Takes `fetch` as a parameter and never imports Tauri (`pnpm check:neutral` enforces this). |
| `src/platform/tauri-fetch.ts` | the only file that imports `@tauri-apps/plugin-http`; returns a plain `typeof fetch`. |
| `src/App.tsx` | UI: per-provider model + key (in memory only), Run buttons, live stream, results table. |
| `src-tauri/` | Rust shell: registers `tauri-plugin-http` (feature `unsafe-headers`), plus `report`/`autorun_requested`/`quit` commands. |
| `src-tauri/capabilities/default.json` | HTTP scope: only `api.openai.com`, `api.anthropic.com`, `localhost:11434`, `127.0.0.1:11434`. |
| `scripts/check-neutral.mjs` | fails if `src/gateway` mentions `@tauri-apps/`. |
| `scripts/node-smoke.ts` | runs `src/gateway` in plain Node with Node's own fetch (neutrality proof). |
| `scripts/mock-ollama.mjs` | minimal Ollama stand-in on :11434 for machines without Ollama. Mock results are not an Ollama verdict. |

## Keys

API keys are typed into password inputs and live only in React state for the
life of the window. They are not written to localStorage, to disk, or to the Rust side, and
they are not logged. An empty key means the stream/object checks report
`SKIPPED`. The transport check still runs, using a deliberately invalid key:
a provider 401 shows the request reached the provider and its body was readable.

## Run (Windows, PowerShell)

    pnpm install
    pnpm check:neutral
    pnpm tauri dev                       # interactive: enter keys, press Run
    pnpm tauri build --debug --no-bundle # builds the exe with embedded assets

Keyless autorun prints results to stdout and exits:

    $env:KUTTAB_SPIKE_AUTORUN = "1"; pnpm tauri dev

Optional mock Ollama (only when no real Ollama runs on :11434):

    pnpm mock:ollama
    pnpm smoke:node

The Rust `target/` directory takes several GB. On this machine E: is short of space, so
the build used `CARGO_TARGET_DIR` on C: (see docs/02-environment.md).
