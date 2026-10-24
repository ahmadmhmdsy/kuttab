# 01 — Project specification

**Contract**
- **Role:** spec — what we are building and why.
- **Mutability:** approval-only. Changes require the owner's decision.
- **Read when:** before any feature, architecture, or scope work.
- **Update when:** the owner approves a spec change. Then append a revision
  entry at the bottom; never silently rewrite history.

Background research: `research/analysis.md` (2026-10-17).

---

## Purpose

**Kuttab** (كُتّاب) is an open-source desktop app that teaches any topic with AI-generated, adaptive lessons and runnable SQL and Python labs. It runs entirely on the learner's own machine and uses whatever LLM the learner brings.

## Problem

DataCamp AI Native and similar adaptive tutors are closed SaaS. They limit you to their catalog and their choice of model, and they require an account. Your data stays on their servers.

The strongest open alternatives are DeepTutor and OpenMAIC. Both need a Python or Postgres server stack, neither treats runnable labs as core, and neither is built for Arabic.

No app combines all of these:
- grounded, adaptive lessons
- in-app labs
- one-click local install with your own model
- an open course format
- first-class Arabic support

## Users and consumers

| Consumer | What they need from this project |
|---|---|
| Self-learner (first-class in v0.1) | Type a topic or import material and get a personal course with checks, labs and review, with no account or setup beyond a key or a local model |
| Student | Learn from their own PDFs and notes, with answers grounded in those sources and cited |
| Teacher / author (later phase) | Write and share course packs that others import, and turn generated lessons into editable packs |
| Contributor | A clear, modular codebase where new lab runtimes, providers and locales plug in |

## Scope — in

- Desktop app built with Tauri 2 for Windows, macOS and Linux, with CI builds for all three.
- Bring your own model, through three kinds of provider:
  - **Cloud API keys:** OpenAI, Anthropic, Google, OpenRouter, and any OpenAI-compatible endpoint.
  - **Local servers:** Ollama, LM Studio, llama.cpp.
  - **In-browser models:** WebLLM, transformers.js.
- Model roles: teacher, grader and embedder.
- A curated list of recommended models, plus any model the user picks, plus user favorites and a user-defined custom model list.
- Onboarding interview that builds a learner profile.
- AI-generated learning plan (an objective graph). It is shown to the learner, who can edit or skip it.
- Typed lesson blocks: explain, worked example, check, exercise, recap. Each lesson is cached once generated.
- Mastery-based pacing and FSRS spaced review.
- Labs in v0.1:
  - **SQL:** sql.js, with DuckDB-wasm considered.
  - **Python:** Pyodide.
  - Both run behind a **pluggable lab-runtime interface**, so more languages can be added later.
- Grading in two stages: deterministic tests first, then an LLM explanation of why the answer is right or wrong.
- Sources:
  - a topic prompt
  - PDF, DOCX, Markdown and notes
  - URLs
  - YouTube transcripts (opt-in, with a paste-the-transcript fallback)
  - importable course packs

  Sources are searched locally. Grounded mode cites its sources.
- Open course-pack format (`.kuttab`). v0.1 ships three sample packs: SQL basics (English and Arabic), Python basics (English and Arabic), and one non-coding topic.
- English and Arabic UI with full RTL support. Generated content can be in either language.
- Light gamification: streaks, mastery bars, count of reviews due.
- Text-to-speech (OS or in-browser voices) and speech input (local Whisper).
- Local storage (SQLite). API keys are kept in the OS keychain.
- Cost meter when a paid key is in use.

## Non-goals — out

- Accounts, auth, a backend server, telemetry: never, because these violate the core promise.
- Cloud sync and leaderboards: no server. Export and import of a backup file instead.
- Avatars and 3D tutors, multi-agent "classroom theater", podcast generation: deferred, out of v1.
- Enterprise and admin features: not the audience.
- A PWA build: deferred to a later phase. The core stays platform-neutral so it remains possible.
- Pack authoring editor for teachers: deferred past v0.1. The format is designed for it now.
- Lab languages beyond SQL and Python: deferred, but the lab interface must not need to change to add them.

## Success criteria

| # | Criterion | How it is evaluated | Threshold |
|---|---|---|---|
| S1 | First lesson fast | A fresh install, then paste a key, then a typed topic. Time to the first lesson block on screen | ≤ 2 min, no terminal needed |
| S2 | Works fully offline | Pull the network cable with Ollama or WebLLM configured, then complete a lesson and a lab | passes |
| S3 | Labs grade deterministically | Run the sample-pack exercise test suites in CI | 100% of reference solutions pass, 100% of known-wrong solutions fail |
| S4 | Grounded answers cite | Run the scripted Q&A eval over a sample pack, in grounded mode | ≥ 90% of answers carry a citation. The tutor refuses on questions that are not in the sources |
| S5 | Arabic renders correctly | Playwright visual checks of the RTL screens with mixed Arabic and code | no mirrored code, no broken bidi, in all three OS CI builds |
| S6 | Small-model viable | The sample SQL pack run end-to-end on a ~8B local model | completes without schema errors (retries allowed) |
| S7 | No network except to the provider | Network capture during a session | only requests to the configured provider or model hosts |

## Constraints

- **Technical:** Tauri 2 with React 19, TypeScript and Vite. pnpm workspace. The teaching engine is pure TypeScript with no Tauri imports, and everything platform-specific goes through one adapter. Every lab runtime implements one shared interface. Webviews differ by OS (WebView2, WKWebView, WebKitGTK), so test on all three.
- **Operational:** No server. Releases are signed Tauri builds from GitHub Actions. Updates come through the Tauri updater against GitHub Releases.
- **Legal or policy:** Apache-2.0 (owner decision 2026-10-17; LICENSE + NOTICE in repo root). No user data leaves the machine except prompts sent to the provider the user chose. YouTube transcript fetching is opt-in.
- **Time or budget:** unknown. No deadline set. Dev machine drive E: has about 10 GB free, which is a hazard for model downloads.

## Key components

```
UI (React, i18n en/ar, RTL)
  └─ Teaching engine (pure TS): profile · plan · lesson gen · grader · mastery · FSRS
       ├─ LLM gateway: AI SDK + fetch adapter → cloud | local server | in-browser
       ├─ Knowledge base: ingest → chunk → local embeddings → hybrid search
       ├─ Lab runtimes (plugin interface): sql (sql.js/DuckDB-wasm) · python (Pyodide) · …
       └─ Storage: SQLite (Tauri) · packs/sources as files · keys in OS keychain
Platform adapter: Tauri (http, keystore, fs, sql, updater) | browser (future PWA)
```

## Milestones

| # | Milestone | Definition of reached | Status |
|---|---|---|---|
| M0 | Spikes | Tauri plus AI SDK over Rust HTTP talks to OpenAI, Anthropic and Ollama. Pyodide and sql.js run in workers with timeouts. Arabic RTL demo screen. Embedding benchmark in English and Arabic | partial — Rust HTTP proven with Google and OpenCode Go; OpenAI/Anthropic/Ollama live runs and the embedding benchmark not done |
| M1 | Topic to lesson | Onboarding, then the plan, then typed lessons with checks, mastery pacing and SQLite storage | reached |
| M2 | Labs | SQL and Python labs behind the runtime interface, graded in two stages. FSRS review queue | reached |
| M3 | Your sources | PDF, DOCX, MD and URL ingestion. Local search. Grounded mode with citations | reached |
| M4 | Packs and v0.1 | `.kuttab` import and export, three sample packs, TTS, speech input, gamification, builds for all three OSes | partial — all but signed builds for three OSes, CI and backup import |
| M5 | Teacher agent | The tutor calls tools (charts, diagrams, math, inline quizzes, code runs, source search, learner memory), each a built-in plugin the learner can switch off in Settings. Plain-chat fallback for models without tool calls | done |
| M6 | Release | Signed installers and auto-update for Windows, macOS and Linux; CI builds; backup import; accessibility pass | pending |
| L1 | Live tutor core (decision 0002) | Agent-led session loop of beats; Chat and Voice (orb) modes; board on the end side; hold-to-talk; labs on the board; Read mode and post-session notes from one lesson record | pending |
| L2 | Adaptation and learner profile | Level worked out as it goes; local learner profile from session notes (global and per track) with an editable "What the tutor knows about me" page; back-to-plan nudges; progress skills map | pending |
| L3 | Track building and sources | Research once per track with a cached resource pack; in-app browser search with approval; provider and key search adapters; learner sources (files, images, URLs, audio, video transcripts); source-mix setting; mid-track web search on request | pending |
| L4 | Voice options and local | Provider realtime voice; always-listening with Silero VAD; Piper voices; MSA and dialects; hardware check; HF and OpenAI-compatible local model linking; session budget with notified switch to local; low-compute mode | pending |
| L5 | Extras | Image generation via a configured model; other tutor looks; goals with dates and reminders (tray opt-in); several learner profiles | pending |

## Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Small local models write weak lessons | high | high | Model roles, cached lessons, packs carry the curriculum, capability probe, curated model list |
| Hallucinated teaching | high | medium | Grounded mode with citations, refusal threshold, deterministic grading |
| WebGPU or webview differences per OS | medium | medium | Feature detection, fallback to Ollama or cloud, CI on all three OSes |
| Provider API or CORS changes | medium | medium | All calls go through Rust HTTP. Provider adapters are isolated |
| API key leakage | high | low | OS keychain. Keys never logged, never exported |
| Surprise cost on paid keys | medium | medium | Cost meter and an optional budget cap |
| YouTube terms of service or breakage | low | high | Opt-in, with a paste fallback |

## Open questions — user-gated

- [ ] Timeline or target date for v0.1.
- [ ] Should the GitHub org or repo be named `kuttab` (check availability), and is a public repo wanted now or at v0.1?
- [ ] App identifier (for example `org.kuttab.app`) and code-signing (Windows and macOS certificates cost money).

## Revision log

Append-only. Newest last.

| Date | Revision | Decision | Authorized by |
|---|---|---|---|
| 2026-10-17 | initial | Scope locked from brainstorm: name Kuttab; v0.1 = lessons + SQL + Python labs (pluggable runtimes); self-learner first; React + TS; Apache-2.0; Win/macOS/Linux; plan shown, editable and skippable; curated, any and custom model lists; light gamification + TTS + speech input; sample packs SQL, Python, non-coding (en + ar) | owner (Ahmad Mahmoud) |
