# Kuttab · كُتّاب

An open-source desktop app that teaches any topic. It writes adaptive lessons and runs SQL and Python labs inside the app, using an LLM you bring. Everything runs on your machine: no account, no server, no telemetry.

> **Status:** pre-code. The scope is locked and Phase 0 spikes come next. There is nothing to install yet.

## What it will do (v0.1)

- **Any topic, or your own material.** Type a topic, or import PDFs, DOCX, Markdown, URLs, YouTube transcripts, or a `.kuttab` course pack.
- **A plan you control.** The tutor interviews you and proposes a learning plan. You can edit it or skip it.
- **Lessons that check you.** Each lesson is made of typed blocks: explanations, worked examples, checks, exercises, recaps. Pacing follows your mastery, and FSRS schedules your reviews.
- **Real labs.** SQL (sql.js) and Python (Pyodide) run in-app and are graded by tests first, then by an LLM that explains the result. More languages can plug in later.
- **Grounded mode.** Answers come only from your sources and cite them. If the answer isn't in your sources, the tutor says so.
- **Any model:**
  - cloud keys: OpenAI, Anthropic, Google, OpenRouter, or any OpenAI-compatible endpoint
  - local servers: Ollama, LM Studio, llama.cpp
  - in-browser models: WebLLM

  A curated model list is included, and you can keep favorites and your own custom list.
- **English and Arabic**, with full RTL support. Text-to-speech, speech input, and light gamification are included.

## Planned stack

Tauri 2 for Windows, macOS and Linux. React 19, TypeScript and Vite in a pnpm workspace. The Vercel AI SDK talks to providers through Rust HTTP. Local data is stored in SQLite, and API keys go in the OS keychain.

## Docs

- What we're building: [docs/01-project.md](docs/01-project.md)
- Research and architecture: [research/analysis.md](research/analysis.md)
- Current state and next tasks: [docs/03-handoff.md](docs/03-handoff.md), [docs/04-tasks.md](docs/04-tasks.md)
- Rules for agents working in this repo: [AGENTS.md](AGENTS.md)

## License

[Apache-2.0](LICENSE) © 2026 Ahmad Mahmoud
