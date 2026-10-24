<div align="center">

# Kuttab · كُتّاب

**English** · [العربية](README.ar.md)

**A private AI tutor that lives on your computer.**
It teaches any topic: it plans the course, teaches it live, runs real code labs, and remembers how you learn.
It works with the model you bring, cloud or local. No account, no server, no telemetry.

[![app](https://github.com/ahmadmhmdsy/kuttab/actions/workflows/app.yml/badge.svg)](https://github.com/ahmadmhmdsy/kuttab/actions/workflows/app.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20·%20macOS%20·%20Linux-informational)
![Languages](https://img.shields.io/badge/UI-English%20·%20العربية-success)

![A live lesson: the tutor talks on the left and draws on the board on the right](docs/media/live.png)

</div>

> The name comes from the *kuttab*, the neighbourhood schools where children
> learned to read with one teacher beside them. Kuttab aims to give every
> learner that teacher.

## Why Kuttab

- **Your tutor, your machine.** Courses, progress, notes and sources are stored in SQLite on your disk. API keys go into the OS keychain and are never written to files or exported.
- **Any model.** Use a key for OpenAI, Anthropic, Google Gemini, OpenRouter, OpenCode or any OpenAI-compatible endpoint. Or run a local model with Ollama, LM Studio, llama.cpp, a GGUF from Hugging Face, or WebLLM in the browser. It can also run fully offline.
- **Arabic and English.** The whole UI is available in both, with full right-to-left layout. The voice speaks Modern Standard Arabic or a dialect.

## What it does

### 🎙️ Live tutor
The tutor runs the session: it explains, asks, waits for your answer and adapts.
- **Modes:** Chat or Voice, with hold-to-talk or always-listening mic (Silero VAD).
- **Voices:** realtime provider voices, Piper voices that run on your machine, or the system voice.
- **Board:** a whiteboard beside the conversation shows charts, diagrams, math, generated images and code labs while the tutor talks.
- **Tutor looks:** an orb, a face or a small character that reacts as it listens, thinks and speaks.
- **Read mode:** turns any session into a written lesson, with notes afterwards.

### 🧭 Courses that fit you
- **Course plan:** type a topic. The tutor researches it once, builds a plan you can reorder or edit, and saves the material for offline use.
- **Pacing:** it works out your level as you go and slows down or speeds up. It steers you back to the plan after side questions.
- **Learner profile:** a page called *What the tutor knows about me* that you can read and edit.
- **Goals:** finish dates with a pace indicator, reminders, and a tray option.
- **Several learners:** separate profiles on one computer.

![Your learning plan](docs/media/plan.png)

### 🧪 Real labs, graded
- **Runs in the app:** SQL (sql.js) and Python (Pyodide) run in sandboxed workers with timeouts.
- **Grading:** answers are graded by tests first, then by the model, which explains what went wrong.
- **Practice:** a free playground, typed lesson blocks (explanations, worked examples, checks, exercises and recaps), and FSRS spaced review.

<p>
  <img src="docs/media/playground.png" width="49%" alt="Playground running SQL">
  <img src="docs/media/progress.png" width="49%" alt="Progress skills map">
</p>

### 📚 Your own sources
- **Import:** PDF, DOCX, Markdown, web pages, images (read by a vision model), audio and video transcripts, and YouTube captions.
- **Search:** local search, with grounded answers that cite your sources.
- **Web research:** only with your approval, through the in-app browser or a search provider you choose.
- **Course packs:** share courses as `.kuttab` files. Three sample packs are included.

### 🧰 A teacher with tools
The tutor calls built-in tools when it needs them: charts, diagrams, math, inline quizzes, code runs, source search, learner memory and image generation. Each tool can be switched off in Settings. Models without tool calls fall back to plain chat.

### 💸 Costs you can see
- **Live counter:** token and cost figures for every session.
- **Budget:** a session limit that switches you to your local model when it is reached.
- **Low-compute mode:** for small machines.
- **Hardware check:** suggests a local model that fits your computer.

<p>
  <img src="docs/media/settings.png" width="49%" alt="Model settings">
  <img src="docs/media/ar-library.png" width="49%" alt="The library in Arabic, right to left">
</p>

## Get started

There are no signed installers yet. To get the app, build it from source, or download an unsigned build from the **Artifacts** of the latest [CI run](https://github.com/ahmadmhmdsy/kuttab/actions/workflows/app.yml).

You need:
- Node 24
- pnpm 12
- Rust (stable)
- the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for your system

```bash
git clone https://github.com/ahmadmhmdsy/kuttab.git
cd kuttab
pnpm install
pnpm tauri dev     # run the desktop app
pnpm tauri build   # build installers into apps/desktop/src-tauri/target/release/bundle
```

On first start:
1. Pick a teacher model under **Settings → Models**. Paste a key, or point Kuttab at a local server such as Ollama.
2. Type a topic and start learning.

## How it is built

| Part | What it does |
| --- | --- |
| `apps/desktop` | Tauri 2 + React 19 + Vite. The UI, the live session, the board, voice and settings. Rust handles HTTP, the SQLite store, the keychain, the tray and the hardware check. |
| `packages/engine` | The teaching engine: plans, lesson blocks, mastery, FSRS review, the live session loop, pacing, the learner profile, the teacher's tools, track research and goals. |
| `packages/llm-gateway` | One interface over cloud and local providers through the Vercel AI SDK, plus a model catalog, prices, model discovery, embeddings and image generation. |
| `packages/kb` | The local knowledge base: extraction, chunking, and hybrid keyword and vector search. |
| `packages/labs` | The SQL and Python runtimes and graders. |
| `packs/` | Sample `.kuttab` course packs. |

Common commands:
- `pnpm test`: runs the unit tests (vitest).
- `pnpm typecheck`: checks types in every package.

CI runs both on every push and builds unsigned installers for Windows, macOS and Linux.

## Status

Kuttab is in **pre-release**. The live tutor, adaptation, track building, voice and local mode, and the extras (images, tutor looks, goals, several learners) all work. Still to do before 1.0:
- signed installers
- auto-update
- backup import

See [docs/01-project.md](docs/01-project.md) for the milestones and [docs/04-tasks.md](docs/04-tasks.md) for the task log.

## Contributing

Issues and pull requests are welcome. The project docs are listed below.

- [docs/01-project.md](docs/01-project.md): scope and milestones
- [research/analysis.md](research/analysis.md): research and architecture
- [docs/03-handoff.md](docs/03-handoff.md): current state
- [AGENTS.md](AGENTS.md): how AI agents work in this repo

## License

[Apache-2.0](LICENSE) © 2026 Ahmad Mahmoud
