# T-3 results — Tauri 2 + AI SDK via tauri-plugin-http

Run on 2026-10-17, Windows 11 Pro 10.0.26200. Everything below was run in this session, and every result has a log under `evidence/`.

## Verdict

**Partial.** The transport is proven: it reaches all three endpoints, with no CORS
block, in the built Windows app. The model checks (stream + `generateObject`) for
real OpenAI, Anthropic and Ollama were **SKIPPED**: no API keys were available,
Ollama is not installed, and the brief forbids model downloads because E: has about 10 GB free.
The full stream + object pipeline was proven only against a **MOCK** Ollama.

| provider | transport | stream | object |
|---|---|---|---|
| OpenAI (`gpt-5-mini`) | PASS: HTTP 401 `invalid_api_key` from api.openai.com | SKIPPED: no API key entered | SKIPPED: no API key entered |
| Anthropic (`claude-haiku-5-5`) | PASS: HTTP 401 `authentication_error` from api.anthropic.com | SKIPPED: no API key entered | SKIPPED: no API key entered |
| Ollama (real) | SKIPPED: Ollama not installed; no model downloads allowed | SKIPPED: same | SKIPPED: same |
| Ollama **MOCK** (`scripts/mock-ollama.mjs`) | PASS (HTTP 200) | PASS (5 deltas) | PASS (`LessonCard` parsed by Zod) |

How the transport check works: every request goes through `tauri-plugin-http` with a
deliberately invalid key. A browser CORS block would show up as a `TypeError`.
A readable provider 401 body shows the request left the app, reached
the provider, and its response could be read.

## Evidence

| file | what |
|---|---|
| `evidence/build-debug.log` | `pnpm tauri build --debug --no-bundle`: tsc + vite + cargo, `EXIT=0`, built `llm.exe` |
| `evidence/autorun-exe-mock.log` | `KUTTAB_SPIKE_AUTORUN=1 llm.exe`, with the Origin header both present (`origin=app`) and stripped; WebView origin `http://tauri.localhost`; exit 0 |
| `evidence/mock-ollama-origins-exe.log` | Origin header as received by the mock, for each request in that run |
| `evidence/node-smoke.log` | `node scripts/node-smoke.ts`: the same `src/gateway` code in plain Node with Node's own fetch → PASS ×3 against the mock (platform-neutrality proof) |
| `evidence/check-neutral.log` | `pnpm check:neutral`: `src/gateway` has no `@tauri-apps/` imports |

## Findings

1. **The plugin sends an `Origin` header.** It sets it to the WebView origin, which is `http://tauri.localhost` in
   the Windows build (see the mock log). With the plugin's `unsafe-headers` feature, sending
   `Origin: ""` removes it (the mock logs `origin=null`). `src/platform/tauri-fetch.ts`
   exposes this as `stripOrigin`.
2. **Anthropic with an Origin header present:** it returned a plain 401
   `invalid x-api-key`, not a CORS-style rejection. *Unverified:* whether a **valid**
   key is rejected when Origin is present and `anthropic-dangerous-direct-browser-access` is absent. Auth may be
   checked first. Recommendation: keep `stripOrigin` on by default until a keyed run settles it.
3. **Real Ollama vs. Origin:** expected but unverified. Ollama's default `OLLAMA_ORIGINS` may reject
   `http://tauri.localhost`; stripping Origin should avoid that. Needs a real Ollama run.
4. **AI SDK 7 deprecates `generateObject`** (`AISDK_DEP_GENERATE_OBJECT` warning). It still
   works. Product code should use `generateText({ output })`.
5. **Bundle size:** the Vite JS bundle is 972.74 kB (254 kB gzip), over Vite's 500 kB warning limit. This is acceptable for a spike.
6. **Disk use:** the Rust `target/` takes 3.5 GB, so it was built with `CARGO_TARGET_DIR` on C:. `node_modules` is 115 MB.
7. The `tauri dev` (dev-origin `http://localhost:1420`) path was **not run**. Only the built exe was.

## To finish T-3 (needs a human)

- Run `pnpm tauri dev`, paste an OpenAI and an Anthropic key into the UI (keys stay in memory only), and press Run all.
  Do this with "strip Origin" both on and off.
- On a machine with space, run `ollama pull llama3.2` (or any small model), then repeat for Ollama.
- Record the results here, with a log under `evidence/`.
