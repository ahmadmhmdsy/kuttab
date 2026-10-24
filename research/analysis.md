# DataCamp AI Native and the AI-tutor landscape

Research for a new open-source, local-first AI teacher app. The app runs on the user's machine and has no account, no backend server and no auth. The user brings their own LLM: a cloud API key, a local model server, or an in-browser model.

- Date: 2026-10-17
- Scope decided with the owner:
  - Domain: generic topics plus hands-on coding labs.
  - Audience: self-learners, students, and teachers/authors.
  - Languages: English and Arabic (RTL).
  - Sources: a topic prompt, PDFs/docs/notes, URLs/YouTube, and importable course packs.
- Status: research report. Nothing is built yet. Claims marked *(unverified)* come from one source or from vendor marketing.

---

## 1. Executive summary

- **What DataCamp AI Native is.** DataCamp gets this capability from Optima, which it acquired in November 2025. An AI tutor first interviews the learner. It then generates each lesson, example and exercise in real time against learning goals set by experts. It answers only from a knowledge base the instructor curates, and it adjusts pace and difficulty as the learner goes. The headline claims ("1 hour = 6 hours", "6x completion") are DataCamp marketing. No independent study backs them.
- **Nothing in open source matches it yet.** The strongest open projects are DeepTutor (HKUDS, Apache-2.0, ~41.6k stars) and OpenMAIC (THU-MAIC, MIT, ~40.9k stars). Both are powerful but server-shaped. DeepTutor needs a Python FastAPI backend, and OpenMAIC needs Next.js plus PostgreSQL. Neither is a double-click desktop app. Neither has runnable code labs as a core feature, and neither is built for Arabic.
- **The opening for this project** is DataCamp-style grounded, adaptive lessons plus real in-app code labs, shipped as a single local app that brings its own model. On top of that come an open, shareable course-pack format and first-class Arabic/RTL support. No product found does all of this.
- **Recommended shape: a Tauri 2 desktop app around a web core.** The same core can also ship later as a limited PWA. Cloud LLM calls go through Tauri's Rust HTTP client, which avoids browser CORS. API keys stay in the OS keychain. Python runs in Pyodide and SQL runs in DuckDB-wasm or sql.js. Retrieval runs locally with transformers.js embeddings. Progress is stored in local SQLite.
- **The biggest risk is model quality, not engineering.** Small local models generate weak lessons. The design must hold up on a 7–8B model: tight structured prompts, lessons cached so they are generated once and reused, and a teacher-authored course pack carrying most of the curriculum.

---

## 2. DataCamp AI Native: feature teardown

### 2.1 Origin and business context
- In November 2025 DataCamp acquired **Optima**, a Dubai company founded in 2021 that builds an AI-native learning platform. Optima's founder, Yusuf Saber, became DataCamp's Chief AI Officer. One report puts the price at about $15M *(unverified)*. Sources: [DataCamp blog](https://www.datacamp.com/blog/datacamp-has-acquired-optima), [BusinessWire](https://www.businesswire.com/news/home/20251112410509/en), [Class Central](https://www.classcentral.com/report/datacamp-acquires-optima/), [Techleap](https://finder.techleap.nl/news/feed/datacamp-acquires-optima-for-ai-growth).
- Business and enterprise access arrived in Q2 2026. Admins can switch AI Native courses on or off. DataCamp also offers partner content: 15 free Anthropic courses and Google Cloud content. Sources: [AI Native for business](https://www.datacamp.com/business/ai-native), [Q2 2026 roadmap webinar](https://www.datacamp.com/hi/resources/webinars/datacamp-quarterly-roadmap-2026-q2-ug).
- Courses seen so far:
  - Intro to AI for Work
  - Intro and Intermediate SQL
  - LLM Application Fundamentals
  - Prompt Engineering
  - An AI Engineering with LangChain track (March 2026)

  Source: [datacamp.com/learn/ai-native](https://www.datacamp.com/learn/ai-native).

### 2.2 The learning loop, reconstructed

| Stage | What the learner sees | What it implies technically |
|---|---|---|
| Onboarding interview | The tutor asks about role, skill level and goals | A **learner profile** object, kept and reused in every prompt |
| Goal-anchored plan | A lesson sequence tied to expert-defined objectives | A **fixed objective graph** per course. The AI improvises *inside* it, not outside |
| Real-time lesson | Explanations and examples generated for this learner, using examples from their field | **Structured generation**: the model fills typed lesson blocks, not free chat |
| Hands-on exercise | Write SQL or code, run it, get it checked | A **sandboxed runner** plus deterministic checks, then LLM feedback |
| Feedback | Why the answer is right or wrong, and what to do next | **Explain-why feedback** built from the checker result, the learner's answer and the objective |
| Adaptation | "Stuck? It slows down. Ahead? It speeds up." | A **mastery estimate** per objective that decides pacing and difficulty |
| Guardrails | It answers only from the instructor knowledge base and says when it is unsure | **Grounded retrieval-augmented generation (RAG)** with refusal, plus content limits |

### 2.3 Strengths worth copying
1. **A fixed spine with a flexible surface.** Experts own the objectives. The AI owns explanation, examples and pacing. This is the main answer to hallucination, and it is the main thing generic chat tutors lack.
2. **Exercises you actually run**, graded first by deterministic checks and only then by the model.
3. **The learner profile drives the examples.** The same SQL JOIN lesson uses marketing data for a marketer and clinical data for a nurse.
4. **Feedback that explains why**, not just pass/fail.

### 2.4 Weaknesses and open questions
- No independent reviews or outcome data exist. The 6x claims come only from DataCamp. Class Central points out the risk of hallucination in generated lessons ([Class Central](https://www.classcentral.com/report/chatgpt-gemini-ai-tutors/)).
- It is a closed SaaS: DataCamp chooses the model, data is stored in the USA, and a subscription is required. The catalog is narrow (data and AI topics only).
- You cannot bring your own material or write your own course as a learner.
- No Arabic interface was found.

---

## 3. Competitor landscape

### 3.1 Closed source

| Product | What it is | Personalization | Hands-on | Notes |
|---|---|---|---|---|
| **DataCamp AI Native** | AI-generated lessons inside expert-defined courses | Onboarding profile, adaptive pace | SQL and Python in the browser | Data and AI topics only. B2B in Q2 2026 |
| **Oboe** ([TechCrunch](https://techcrunch.com/?p=3044797), [Dealroom](https://dealroom.co/companies/oboe/)) | Courses on any topic, built after a diagnostic chat | Diagnostic conversation | No coding labs | From the Anchor co-founders. $16M Series A led by a16z. Several formats: articles, audio/podcast, quizzes, games, flashcards. Multi-agent fact-checking. Freemium, 5 free courses |
| **Google Learn Your Way** ([Gigazine](https://gigazine.net/gsc_news/en/20250919-google-learn-your-way), [RCT paper](https://arxiv.org/pdf/2509.13348)) | Reshapes a textbook to the learner's grade level and interests | Grade level and interests | No | A Labs experiment on LearnLM / Gemini 2.5 Pro. Offers mind maps, audio, narrated slides and quizzes. Has a randomized controlled trial behind it |
| **ChatGPT Study Mode / Gemini Guided Learning / Claude Learning mode** | Socratic modes inside general chat apps | Light | Code only through general tools | Released July–August 2025. No curriculum spine and no mastery tracking |
| **Khanmigo** | Socratic tutor on top of Khan Academy content | Course context | Khan exercises | About $4 per month. A strong pedagogy reference |
| **Duolingo Max** | Roleplay and "explain my answer" | Lesson context | Speaking | Language learning only |
| **Coursera Coach** | Q&A and quizzes over course videos | Course context | No | |
| **Boot.dev / Scrimba / Codecademy** ([Scrimba](https://scrimba.com/articles/best-zero-to-mastery-alternatives/)) | Coding courses with AI help (Boots, Instant Feedback) | Little | Yes, in-browser coding | The AI is a helper on top of fixed courses, not the course generator |

### 3.2 Open source

| Project | License / size | Stack | What it does well | Fit for "local, no server" |
|---|---|---|---|---|
| **DeepTutor** ([GitHub](https://github.com/HKUDS/DeepTutor)) | Apache-2.0, ~41.6k stars, v1.6.14 | Python FastAPI + Next.js 16 | Many modes (chat, quiz, research, solve, course, Mastery Path, Book, audio overview). Several RAG engines (LlamaIndex, GraphRAG, LightRAG). Three-layer memory. Many providers, including local ones | Partial. Runs locally through pip or Docker, but it is a Python server plus a web UI, not a desktop app |
| **OpenMAIC** ([GitHub](https://github.com/THU-MAIC/OpenMAIC)) | MIT, ~40.9k stars, v1.2.0 (2026-10-16) | Next.js 16 + PostgreSQL | A multi-agent "classroom". It turns an outline into scenes: slides with TTS, quizzes, HTML simulations, project-based learning, whiteboard, in-browser coding. Exports to PPTX/HTML/ZIP. 12 locales | Poor. Needs Postgres and a long-running server. Keys go in `.env` |
| **OpenEdu** (several forks, e.g. [DYNOSuprovo/OpenEdu](https://github.com/DYNOSuprovo/OpenEdu)) | Varies | Python + SQLite | A 6-level curriculum for any topic. Supports Ollama, OpenAI and Anthropic. Tuned for small models | Close in spirit, but small and the original repository is unclear |
| **Open TutorAI** ([arXiv 2602.07176](https://www.arxiv.org/pdf/2602.07176)) | Research | Ollama + Docker | 3D avatars, onboarding, interfaces for learners, educators and parents | Research grade |
| **Open Notebook / SurfSense / KnowNote / AnythingLLM / kotaemon** ([overview](https://openalternative.co/alternatives/notebooklm)) | Mostly MIT or Apache-2.0 | Python servers, Docker | NotebookLM-style source Q&A, podcasts, and Anki-style cards (KnowNote) | References for the "bring your own sources" part, not for teaching |
| **Mr. Ranedeer** ([listing](https://www.sourcepulse.org/projects/1827833)) | ~30k stars, discontinued | A single GPT-4 prompt | Learner controls depth, style and tone. `/plan` and `/test` commands | Shows demand for configurable tutors. Its prompt design is worth reading |
| **Small Ollama tutors** (e.g. [mattwag05/Tutor](https://github.com/mattwag05/Tutor)) | Varies | Python/JS | A chat tutor on top of local models | Toys, but they confirm the use case |

### 3.3 Where everyone sits

```
                      grounded curriculum spine
                                 ▲
         DataCamp AI Native ●    │    ● Khanmigo
                                 │
     ◆ THIS PROJECT (target)     │         ● Boot.dev / Scrimba
                                 │
 runs locally ◄──────────────────┼──────────────────► cloud SaaS only
                                 │
      OpenEdu ○  DeepTutor ○     │   ● Oboe   ● Learn Your Way
         (needs Python server)   │
       OpenMAIC ○ (Postgres)     │   ● ChatGPT/Gemini/Claude study modes
                                 ▼
                       free-form, chat-shaped
```
● closed source · ○ open source · ◆ target

---

## 4. Gaps and differentiation

The following gaps are open and none of the products reviewed fills them:

1. **A real desktop app with zero setup and your own model.** DeepTutor and OpenMAIC both need a server stack. Here the user installs one app, pastes a key or points at Ollama, and is learning within two minutes.
2. **Grounded adaptivity, done the DataCamp way, but open.** Objectives are fixed (from a teacher's course pack or confirmed by the learner) and the lesson surface is generated. No open tool separates the two cleanly today.
3. **Runnable labs as a first-class feature**, all in-app and offline: Python (Pyodide), SQL (DuckDB-wasm / sql.js) and JS/HTML. Exercises are graded first by deterministic tests and then by LLM explanation.
4. **An open course-pack format** that works like an "EPUB for adaptive courses". Teachers write packs in Markdown and YAML, keep them in git, share them as a single file, and learners import them. This also gives the project a community and content flywheel that closed products cannot copy.
5. **Arabic as a first-class language**: an RTL interface, Arabic lessons, correct bidirectional handling of code inside Arabic text, and Arabic-capable embeddings. No competitor reviewed treats this seriously.
6. **Privacy by design**: no account, no telemetry, data stays on the machine, and the learner sees cost per session when using a paid key.
7. **Honest about uncertainty**: it cites the source passage for each claim and says "not in your sources" instead of guessing.

What we will **not** compete on in v1: avatars and 3D, multi-agent classroom theater (OpenMAIC), podcast generation (Oboe, NotebookLM clones) and enterprise admin.

---

## 5. Recommended architecture

### 5.1 Platform decision: Tauri 2 desktop, built on a web core

| Option | For | Against | Verdict |
|---|---|---|---|
| **Tauri 2** | Small installer (MBs instead of ~100+ MB). Its Rust HTTP plugin **avoids browser CORS** for every LLM provider. OS-keychain plugins for API keys. Local SQLite plugin. Signed auto-updates. Mobile targets exist | Webviews differ per OS (WebView2, WKWebView, WebKitGTK), so test on all three. Needs Rust in the toolchain (installed here, rustc 1.98) | **Choose this** |
| Electron | One Chromium everywhere, which helps WebGPU consistency. Huge ecosystem | Large downloads and RAM use. Security hardening is on you | Fallback if WebGPU in the webviews is a blocker |
| PWA only | Zero install, just a link | CORS blocks some providers. Keys live in browser storage. Storage can be evicted. Hard to reach Ollama without the user configuring `OLLAMA_ORIGINS` | **Secondary target** later, from the same core, with limited features |

Sources: [Tauri vs Electron (Peerlist)](https://peerlist.io/jagss/articles/tauri-vs-electron-a-deep-technical-comparison), [dev.to](https://dev.to/alxnddr/electron-vs-tauri-for-your-next-project-2dna).

### 5.2 Layers

```
┌──────────────────────────────────────────────────────────────────┐
│ UI (React + TS, Vite) · i18n en/ar · RTL via CSS logical props    │
├──────────────────────────────────────────────────────────────────┤
│ Teaching engine (pure TS, no UI)                                  │
│  learner profile · objective graph · lesson planner               │
│  lesson generator (typed blocks) · grader · mastery model · FSRS  │
├───────────────┬─────────────────┬────────────────┬───────────────┤
│ LLM gateway   │ Knowledge base  │ Labs runtime   │ Storage       │
│ AI SDK + own  │ ingest PDF/MD/  │ Pyodide worker │ SQLite (Tauri)│
│ fetch adapter │ URL/YouTube →   │ DuckDB-wasm /  │ or IndexedDB/ │
│ cloud·Ollama· │ chunks → local  │ sql.js · JS    │ OPFS (PWA)    │
│ WebLLM        │ embeddings·hybrid│ iframe sandbox│ packs on disk │
│               │ search          │                │               │
├───────────────┴─────────────────┴────────────────┴───────────────┤
│ Platform adapter: Tauri (http, keystore, fs, sql) | Browser (PWA) │
└──────────────────────────────────────────────────────────────────┘
```

The rule that keeps the PWA possible: **the teaching engine never imports Tauri.** Everything platform-specific goes through one adapter interface.

### 5.3 LLM gateway, with three kinds of provider

| Kind | Examples | How it connects | Notes |
|---|---|---|---|
| Cloud key | OpenAI, Anthropic, Google, OpenRouter, Groq, Mistral, DeepSeek, any OpenAI-compatible URL | The Vercel AI SDK provider packages, with a **custom `fetch` that routes through `tauri-plugin-http`**, so CORS no longer applies | In the PWA, only providers that allow browser calls work. Anthropic does so with the `anthropic-dangerous-direct-browser-access` header ([context](https://github.com/vercel/ai/issues/3041)). Re-check each provider in a spike |
| Local server | Ollama, LM Studio, llama.cpp server, Jan | An OpenAI-compatible endpoint on `localhost`, or [ai-sdk-ollama](https://cdn.jsdelivr.net/npm/ai-sdk-ollama@4.0.0/README.md) | The app auto-detects ports 11434, 1234 and 8080. Ollama is **not installed** on this machine yet |
| In-browser | WebLLM (MLC), transformers.js v4 (WebGPU) | `@browser-ai/*` AI SDK providers in a Web Worker | Fully offline. Models are 1–5 GB each, so warn about disk: drive E: has only about 10 GB free. Good for embeddings and small tasks, weak for writing whole lessons |

Two more pieces sit in the gateway:
- **Model roles.** The user assigns a model per job: *teacher* (lesson writing, the strong model), *grader* (short feedback, can be cheaper) and *embedder* (always local by default). This keeps cost and quality under control.
- **Capability probe.** On first connect, the app runs a 3-question JSON test so it knows whether the model can follow schemas. Weak models are switched to simpler prompt templates.

### 5.4 Teaching engine (what makes it a teacher rather than a chat app)

1. **Onboarding interview** gives a `LearnerProfile`: goal, background, field for examples, level, language, time budget and preferred style.
2. **Objective graph.** It comes from one of two places:
   - a course pack, where the teacher wrote the objectives, or
   - generation from a topic or sources, which the learner reviews and confirms before learning starts.
   Each objective lists its prerequisites, its knowledge-base references and its checks.
3. **Lesson generation into typed blocks**:
   - `explain`
   - `worked_example`
   - `check` (multiple choice or short answer)
   - `exercise` (a lab with tests)
   - `recap`

   These come out as structured output through the AI SDK's `generateObject`, validated with Zod. Every claim block carries citations to knowledge-base chunks. **Lessons are cached once generated**, so a review costs nothing and small models are spared.
4. **Grading** happens in two stages. Deterministic first: exact or regex answers, unit tests in Pyodide, comparing a SQL result set. Then the LLM explains why, given the test output and the learner's answer.
5. **Mastery model.** A simple per-objective estimate (Elo- or BKT-style) drives pacing:
   - Fail twice: re-explain with a new analogy and drop the difficulty.
   - Pass quickly: skip the worked example.
6. **Spaced review.** Each passed `check` becomes a card scheduled by **FSRS** through `ts-fsrs`. FSRS is the scheduler used across Anki, with FSRS-6 shipping in Anki 25.07 ([LECTOR paper context](https://arxiv.org/pdf/2508.03275)).
7. **Guardrails.** In "grounded" mode the tutor answers only from retrieved chunks. Below a relevance threshold it says the answer is not in the sources and offers to search more or switch to open mode. Open mode is labelled clearly.

### 5.5 Labs runtime

| Lab type | Engine | Grading |
|---|---|---|
| Python | **Pyodide** (about Python 3.13) in a Web Worker, with a timeout and an interrupt buffer | pytest-style assertions shipped in the pack |
| SQL | **DuckDB-wasm** (analytics, Parquet/CSV) or **sql.js** (SQLite dialect, light) | Compare the result set against the expected query |
| JS / HTML / CSS | A sandboxed `iframe` with a strict CSP | DOM or console assertions |
| Data / notebooks | Possibly later: JupyterLite-style cells | — |

DuckDB inside Pyodide is still experimental ([DuckDB blog](https://duckdb.org/2024/10/02/pyodide)), so run them side by side, not nested.

### 5.6 Knowledge base (local RAG)

- **Ingest:**
  - PDF: `pdf.js` text layer, with OCR deferred to later.
  - DOCX: `mammoth`.
  - Markdown and plain text.
  - URL: fetched via Tauri HTTP, then cleaned with Readability.
  - YouTube: the transcript fetched via Tauri. This is fragile and possibly against YouTube's terms, so it stays an opt-in feature and the app lets the user paste a transcript instead.
- **Chunk** by headings at about 500 tokens, with overlap.
- **Embed** locally with transformers.js using a **multilingual** model, so Arabic works (for example multilingual-e5-small; pick one in a benchmark spike).
- **Search** is hybrid: BM25 plus vectors (for example Orama, or sqlite-vec in Tauri). Results are re-ranked by source scope.

### 5.7 Storage

- **Desktop:** SQLite via `tauri-plugin-sql` for profiles, progress, cards and cache. Packs and sources are plain files in an app data folder that the user can see.
- **PWA:** IndexedDB or OPFS SQLite. Offer export and import as one `.zip` backup, since browser storage can be evicted.
- **Keys:** in the OS keychain on desktop. In the PWA they live in a session-only setting by default, with a clear warning.

### 5.8 Course-pack format (draft)

```
my-course.tpack            (a zip; also works as a plain folder)
├── pack.yaml              id, title, version, language(s), license, authors, min_app
├── objectives.yaml        id, title, prereqs[], kb_refs[], mastery: {checks: n}
├── kb/                    source material (md, pdf) the tutor is grounded in
├── lessons/               optional hand-written or pre-generated lesson blocks (md + front-matter)
├── labs/<id>/             starter code, tests, datasets (csv/parquet/sqlite)
├── prompts/               optional style or persona overrides
└── i18n/ar/               optional translated titles and lessons
```
Design principles:
- Text-first, so git diffs stay readable.
- Lessons are optional, so a pack can be just objectives plus a knowledge base and the AI fills in the rest.
- Lessons a learner generates can be **exported back** into a pack. Teachers use this to author: they generate, edit, then publish.

### 5.9 i18n and RTL plan

- `dir` is set from the UI language, and `dir="auto"` is applied to each generated message so mixed Arabic and English renders correctly.
- Only CSS logical properties are used (`margin-inline-start`, `inset-inline-end`). Icons with direction are mirrored, but the media controls and the code editor are not.
- **Code blocks are always LTR**, isolated with `<bdi>` / `unicode-bidi: isolate`. Inline code inside Arabic text gets bidi isolation.
- An Arabic font stack (for example IBM Plex Sans Arabic or Noto Naskh/Sans Arabic) sits next to the Latin face, with line height tuned for Arabic.
- ICU message format for Arabic plurals, which have six forms. Use FormatJS or i18next with ICU.
- Language is set per learner and per pack. The tutor's system prompt pins the output language. Technical terms stay in English the first time they appear, with the Arabic gloss next to them.

### 5.10 Suggested stack (to confirm in the brainstorm)

| Concern | Pick | Alternative |
|---|---|---|
| Shell | Tauri 2 | Electron |
| UI | React 19 + TypeScript + Vite | Svelte 5 / SolidJS |
| Styling | Tailwind v4 (supports logical properties) + Radix primitives | CSS modules |
| State | Zustand + TanStack Query | Jotai |
| LLM | Vercel AI SDK (v6/v7) + custom fetch adapter | Hand-rolled OpenAI-compatible client |
| Schema | Zod | Valibot |
| Editor | CodeMirror 6 | Monaco (heavier) |
| Python | Pyodide | — |
| SQL | DuckDB-wasm + sql.js | — |
| Retrieval | transformers.js embeddings + Orama | sqlite-vec |
| Review | ts-fsrs | — |
| Package manager | pnpm (installed, 12.3.4) | bun |
| Tests | Vitest + Playwright | — |

---

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Small local models write poor lessons | The core experience suffers | Model roles, cached lessons, packs carrying the curriculum, a capability probe, and a recommended-models list |
| Hallucinated content | Learners are taught wrong things | Grounded mode with citations, a refusal threshold, deterministic grading, and a "report this lesson" flag stored locally |
| Provider CORS and API changes | Broken calls in the PWA | Desktop routes through Rust HTTP. PWA support is limited to a checked list |
| Key leakage | User cost and security | OS keychain, keys never logged, keys never put in packs or exports |
| Cost surprise on paid keys | User distrust | Token and cost meter per session, plus an optional budget cap |
| YouTube transcript fetching | Breakage or terms-of-service issues | Opt-in, with a paste-transcript fallback |
| WebGPU differences across webviews | In-browser models fail on some OSes | Feature-detect it, fall back to Ollama or cloud, and keep WebLLM optional |
| Disk space (about 10 GB free on E:) | Model downloads fail | Show the model size before download and let the user choose the cache folder |

---

## 7. Phased roadmap (draft)

| Phase | Outcome |
|---|---|
| **0. Spikes (1–2 weeks)** | Tauri plus AI SDK through the Rust HTTP plugin for OpenAI, Anthropic and Ollama. Pyodide in a worker with a timeout. Arabic RTL demo screen. Embedding model benchmark in English and Arabic |
| **1. MVP "topic to lesson"** | Onboarding, then a generated objective list the learner confirms, then typed lessons with checks, mastery-based pacing and local SQLite. One provider of each kind. English and Arabic UI |
| **2. Labs** | Python and SQL labs with deterministic tests and explain-why feedback. FSRS review queue |
| **3. Your sources** | Import PDF, MD and URL, local RAG, grounded mode with citations |
| **4. Course packs** | `.tpack` import and export, an authoring flow (generate, edit, export), and 2–3 sample packs (for example SQL basics in English and Arabic) |
| **5. Reach** | PWA build, WebLLM fully offline mode, YouTube, JS/HTML labs, and community pack sharing (a git repo index, still no server) |

---

## 8. Open questions for the brainstorm

1. **Product name** and a one-line pitch.
2. **MVP cut:** is "topic to lesson to check" without labs enough for v0.1, or must one lab type ship on day one? If so, Python or SQL?
3. **Who comes first:** the self-learner (generate anything) or the teacher (author packs)? This changes the first screen.
4. **Curriculum authority:** should the learner always confirm or edit the generated objective list before learning starts, or only when they want to?
5. **Default model guidance:** recommend specific cloud and local models in the app, or stay neutral?
6. **License:** MIT, Apache-2.0 (patent grant, like DeepTutor) or AGPL (keeps forks open)?
7. **UI framework:** React (largest ecosystem, my default) or Svelte or Solid (smaller and faster)?
8. **Platforms for v1:** Windows only first (your machine), or Windows, macOS and Linux from the start?
9. **Gamification:** streaks and XP like Duolingo and Boot.dev, or keep it calm and focused?
10. **Voice:** is text-to-speech or speech input in scope for v1 (useful for Arabic learners), or later?
