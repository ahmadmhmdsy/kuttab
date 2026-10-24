# Handoff archive -- 2026

Rotated entries, newest first. Rotation moves; it never deletes.

## 2026-10-18T12:10:00+03:00 — OpenCode Go works; Settings in tabs; AI SDK deprecations gone

- **State:** both live providers (Google, OpenCode Go longcat) generate plans and chat in the Tauri app. Settings is a tabbed page. Nothing committed.
- **Did:** OpenCode Go needs `x-opencode-session` (else 400 MissingSessionID) and a User-Agent, now sent via `ProviderInfo.headers`, one id per app run. engine `structured()` uses `generateText` + `Output.object` and `instructions`, and puts the JSON Schema in the prompt for providers without native structured output. Test button budget is 512 tokens for reasoning models. Settings tabs: Models, Learning, Voice, Appearance (language, theme system/light/dark, text size), Usage and cost, Privacy and data (JSON backup export with no keys, erase).
- **Verified:** vitest 45/45, tsc OK. In Tauri over CDP: OpenCode Go Test and plan PASS; tabs, dark/light theme and large text apply.
- **Unverified / open:** backup export save dialog not driven; no backup import yet. Teacher has no tool-calling.
- **Next:** owner decides on agent tools (visuals, quizzes) and the plugin model.
- **Blockers:** none.
- **Artifacts:** packages/engine/src/llm.ts, packages/llm-gateway/src/providers.ts, apps/desktop/src/screens/Settings.tsx.

## 2026-10-18T11:30:00+03:00 — T-9 and T-11 done in the real Tauri webview

- **State:** `tauri dev` runs. Every LLM feature works with Google `gemini-3.1-flash-lite`. OpenCode Go is added but its chat endpoint fails server-side. Nothing committed.
- **Did:** drove WebView2 over CDP (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`). Added provider `opencode-go` (https://opencode.ai/zen/go/v1, no structured outputs) and catalog entries for gemini-3.1-flash-lite, longcat-2.5-preview-free and beam-free. discover.ts strips Google's `models/` prefix. Fixes: the "Models found" count is now translated, Playground ms are rounded, the duplicate "Back to plan" link on a finished lesson is gone, and lesson buttons are spaced.
- **Verified:** keychain save and remove PASS. Google listing (63) and Test PASS. Plan generation, lesson, tutor chat, wrong-check explanation, reflect grading, review queue PASS. SQLite/KV survive a reload. Pack add, cited Sources Ask, web page import (26 passages), SQL and Python labs PASS.
- **Unverified / open:** OpenCode Go chat returns HTTP 500 with an empty body even without a key, so it is their side. Export and a full app restart were not driven. gemini-3.1-flash-lite has no price, so cost shows "unknown". `generateObject` deprecation warning.
- **Next:** the owner checks their OpenCode Go plan/status, then re-runs Test.
- **Blockers:** OpenCode Go server 500.
- **Artifacts:** packages/llm-gateway/src/providers.ts, packages/llm-gateway/src/catalog.ts, packages/llm-gateway/src/discover.ts.

## 2026-10-18T10:40:00+03:00 — T-10 done: strict CSP, ONNX runtime served locally

- **State:** the Tauri app ships a strict CSP (was `null`). All scripts, wasm and workers load from the app. connect-src is IPC plus the Whisper/WebLLM model hosts. Nothing committed.
- **Did:** tauri.conf.json now sets `csp` and `devCsp`, which adds inline scripts and HMR ws. In vite.config.ts, `localAssets()` now serves both Pyodide and onnxruntime-web (`/ort/`, ~41 MB). `KUTTAB_CSP=1` applies the tauri.conf CSP to vite dev/preview. speech.ts points transformers.js at `/ort/` with `useWasmCache=false` (no CDN, no blob:). launch.json gained `kuttab-desktop-csp`.
- **Verified:** desktop build PASS. Under `KUTTAB_CSP=1 vite preview` (Chromium): the CSP header is present, SQL and Python playgrounds PASS, `/ort/` mjs import and wasm compile PASS, huggingface.co gets 200, and jsdelivr is blocked (the only violation). `cargo check` PASS. vitest 44/44 PASS.
- **Unverified / open:** not run in a real Tauri webview (nonce injection, `ipc:`, WebKit). No full Whisper or WebLLM run; no `*.hf.co` redirect test. `devCsp` not exercised.
- **Next:** T-9, `pnpm --filter @kuttab/desktop tauri dev` with devtools open, watching for CSP violations.
- **Blockers:** none for T-10.
- **Artifacts:** apps/desktop/src-tauri/tauri.conf.json, apps/desktop/vite.config.ts, apps/desktop/src/speech.ts.

## 2026-10-18T10:25:00+03:00 — MVP built; browser-verified, Tauri runtime and LLM untested

- **State:** Kuttab's MVP exists. It covers lessons, SQL and Python labs, an editable plan, light gamification, en/ar with RTL, and 6 sample packs. It runs in the browser preview, and the Tauri 2 shell compiles. Nothing is committed (still on `master` with no commits).
- **Did:** rebuilt the docs lost in the E: repair. Finished packs/python-basics.ar.kuttab and added packs/critical-thinking.{en,ar}.kuttab. Added apps/desktop/src-tauri/, which has: kv_* on SQLite (app_data_dir/kuttab.db), secret_* on the OS keychain (service dev.kuttab.app), export_file via a save dialog, and the http/opener/dialog plugins. Added .claude/launch.json. Added task rows T-8 to T-11. AGENTS.md component paths are no longer marked planned.
- **Verified:** `npx vitest run packages` 44/44 PASS. `npx vitest run packs` PASS (all 6 packs, solutions and wrong answers). `cargo check` (apps/desktop/src-tauri) EXIT=0. Browser preview PASS with no console errors: onboarding, library, lesson + check XP, SQL exercise grading (wrong column count rejected), Python run, ar RTL, plan editing.
- **Unverified / open:** `pnpm tauri dev` was not run, so keychain, SQLite and export are untested at runtime. CSP is `null`. No LLM feature has been exercised with a real model. T-4/T-5/T-6 spikes are superseded in practice by packages/labs and the RTL UI, but their exact pass criteria (loop kill, WebView2 mirroring, embedding recall) were not re-run.
- **Next:** the owner runs `pnpm --filter @kuttab/desktop tauri dev` and does the T-9 smoke test.
- **Blockers:** T-11 and T-3 are gated on owner API keys or a local model server. T-7 is gated on owner answers.
- **Artifacts:** apps/desktop/src-tauri/src/lib.rs, apps/desktop/src/platform/, packs/, docs/04-tasks.md.

## 2026-10-18T00:10:00+03:00 — T-3 spike built; transport proven, model checks blocked on keys/Ollama

_(timestamp corrected 2026-10-18 from 23:47: entry was written after the 23:55 entry below)_

- **State:** spikes/llm/ is a working Tauri 2 + React 19 + AI SDK 7 app. It routes the SDK through tauri-plugin-http and builds and runs on Windows. The T-3 gate (real stream + generateObject from all 3 providers) is not met: there were no API keys, and Ollama is not installed.
- **Did:** scaffolded spikes/llm/. Platform-neutral gateway in spikes/llm/src/gateway/; the only Tauri import is spikes/llm/src/platform/tauri-fetch.ts. HTTP scope is limited to the 3 hosts. Keys live in React state only. Added keyless autorun, mock Ollama, a Node smoke script, and a neutrality check. Wrote spikes/llm/RESULTS.md. T-3 is set to blocked. Nothing committed.
- **Verified:** `pnpm tauri build --debug --no-bundle` EXIT=0. `KUTTAB_SPIKE_AUTORUN=1 llm.exe`: OpenAI and Anthropic transport PASS (provider 401 on an invalid key, no CORS block); mock-Ollama transport/stream/object PASS. `node scripts/node-smoke.ts` PASS ×3. `pnpm check:neutral` PASS. Logs are in spikes/llm/evidence/.
- **Unverified / open:** real OpenAI, Anthropic and Ollama stream/object SKIPPED (no keys; no Ollama, and no model downloads allowed). Unknown whether Anthropic rejects a valid key when the plugin's Origin header is present; stripping Origin works and is the default. `generateObject` is deprecated in AI SDK 7. The `tauri dev` origin was not run.
- **Next:** the owner runs `pnpm tauri dev` in spikes/llm, enters OpenAI and Anthropic keys, presses Run all, and records the result in spikes/llm/RESULTS.md.
- **Blockers:** T-3 is gated on owner-supplied API keys, and on Ollama plus a small model (needs disk space beyond E:'s ~10 GB).
- **Artifacts:** spikes/llm/RESULTS.md, spikes/llm/evidence/, spikes/llm/README.md.

## 2026-10-17T23:55:00+03:00 — T-2 scope locked; Kuttab spec written

- **State:** product is named Kuttab and its v0.1 scope is locked in docs/01-project.md. No app code exists yet.
- **Did:** filled docs/01-project.md (purpose, users, scope, non-goals, S1–S7, constraints, M0–M4, risks, revision log); replaced AGENTS.md component row with planned components; filled glossary, sources-of-truth, runbook index; rewrote README for Kuttab; replaced MIT LICENSE with official Apache-2.0 text + NOTICE; fixed 02-environment timestamps to ISO-8601 with offset; added T-3..T-7.
- **Verified:** `python E:/context_gen2/skills/adopt-context-pack/scripts/setup.py check --target E:/js_projects/AI_teacher_app` (result recorded in the session reply).
- **Unverified / open:** research/analysis.md still says `.tpack` and "Python later"; docs/01-project.md supersedes it. Open owner questions are tracked in T-7.
- **Next:** T-3 (LLM gateway spike).
- **Blockers:** T-7 is gated on the owner.
- **Artifacts:** docs/01-project.md, docs/04-tasks.md, README.md, LICENSE.

## 2026-10-17T23:30:00+03:00 — T-1 research report delivered; brainstorm next

- **State:** research done; product scope not yet locked. No app code exists.
- **Did:** wrote research/analysis.md (teardown, landscape, gaps, architecture, risks, roadmap, open questions); published research/analysis.html as a private Artifact (https://claude.ai/artifact/U35hujS26Q5VSroR3KHfkj).
- **Verified:** files written; artifact publish returned version 1. Market figures (6x claims, ~$15M price) are vendor/single-source and marked unverified in the report.
- **Unverified / open:** provider CORS behavior per provider (spike needed); embedding model choice for Arabic; setup.py check not yet run; home markers in docs/01, 06, 07, 10, AGENTS.md, README.md still open.
- **Next:** brainstorm with owner on the ten open questions in research/analysis.md §8, then fill docs/01-project.md (T-2).
- **Blockers:** T-2 waits on owner answers.
- **Artifacts:** research/analysis.md, research/analysis.html

## 2026-10-17T22:00:00+03:00 — context pack adopted (lite); research phase

**State.** Empty greenfield repo. Context pack v2.0.0 installed with `--lite`. No product code. Product direction (a local-first, BYOK, open-source AI learning app inspired by DataCamp's AI-native platform) is being researched.
**Did.** `git init`; installed the pack; filled docs/02-environment.md from measured facts; cleared the pack's seeded state.
**Verified.** `setup.py check` — see the handoff report in chat for the output.
**Unverified / open.** Purpose, scope, stack, success criteria in docs/01-project.md are pending the owner's answers.
**Next.** Finish the competitive analysis report, then brainstorm scope with the owner.
**Blockers.** Owner decisions on scope (docs/01-project.md open questions).
**Artifacts.** docs/01-project.md, docs/02-environment.md
