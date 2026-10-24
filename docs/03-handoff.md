# 03 — Handoff (state)

**Contract**
- **Role:** narrative state — where we are.
- **Mutability:** **append-only, newest first.** Never edit or delete a past
  entry. Correct a past entry by writing a new entry that supersedes it.
- **Read when:** session start, before anything else.
- **Update when:** any milestone, incident, decision, or resume point.

**Why append-only:** the value of this file is that it records what was
believed at the time. Editing history destroys exactly that.

---

## Entry format

Copy _templates/handoff-entry.md. Every entry answers:

- **State** — where the project is right now.
- **Did** — what this session actually changed.
- **Verified** — what was checked, with the command and the result.
- **Unverified / open** — what was not checked and what remains.
- **Next** — the single next step.
- **Blockers** — anything gated, and on what.
- **Artifacts** — paths worth opening, as path:line where possible.

## Rotation

The newest entries stay inline, newest first. Older entries move verbatim to
`docs/handoff/archive-2026.md`; rotation never deletes and never rewrites. A new
entry is prepended inside the markers below.

---

<!-- rotate:begin -->
## 2026-10-24T16:00:00+03:00 — T-26 done: a live session on a local model with no network

- **State:** with the learner's OK, Ollama 0.40.10 is installed (winget) and `llama3.2` (2.0 GB) is pulled; it runs fully on the GPU. T-26 is done but not committed (T-25 is `ace5b21`).
- **Verified:** Tauri over CDP, teacher and local set to ollama:llama3.2, with in-app fetch and WebSocket blocked for every non-loopback host. Live mode: 7 calls, all to `localhost:11434/v1/chat/completions`, 0 sockets; the webview loaded only localhost:1420 and ipc.localhost; header showed $0.0000 · 9,571 tokens; a typed answer was graded by llama3.2. Afterwards the OS listed no Google connection from the app's processes (the one left, 40.104.205.2, belongs to the WebView2 runtime). Low mode: one call wrote the whole script and the session read the beats up to "دورك".
- **Gotcha:** the first run was not local: the T-25 voice setting (Gemini Live realtime, always listening) taught the session over a WebSocket. A local session needs the voice on the system voice or Piper; the app does not switch it by itself yet.
- **Unverified / open:** the network adapter was not turned off (a system setting); offline was shown by blocking in-app and checking the OS. llama3.2 teaches poorly (repeated questions, a board titled "3."), so a larger model is advised for real use. The 20 s slow-model notice did not fire (fast GPU). The budget switch was not seen live with a cloud model.
- **Settings:** restored after the test — teacher back to google:gemini-flash-lite-latest, voice back to Gemini realtime / always / Egyptian, live mode "live"; local fallback left at ollama:llama3.2.
- **Next:** decide whether a local session should force a local voice; then T-27.

## 2026-10-24T15:00:00+03:00 — T-26 built, blocked on a local model: local mode

- **State:** T-25 is committed as `ace5b21`. T-26 is built and tested but not committed. Its pass (a full live session with the network off) needs Ollama and a model on this machine, which the learner has not agreed to download yet.
- **Did:** gateway `local.ts`: `recommendLocal` (RAM tier, a model may take half the memory, embedder, Whisper size, low-compute flag, download size against free disk), `detectLocalServers`, `isLocalModel`, `hfToOllama` (HF links become `hf.co/user/repo[:quant]`), `hfGgufFiles` (sizes before pulling), `ollamaModels`, `pullOllama` (NDJSON progress); catalog gets `gb` and Qwen3 14B. Engine `local.ts`: `budgetCtx` (per-session USD limit; at the limit it swaps in the local model, or fences the cloud models with `BudgetSpentError` when there is none) and `scriptBrain` (low-compute: one call writes the section, beats are read in order; only questions and free answers call the model). Desktop: Rust `hardware` command (sysinfo: RAM, cores, free disk of the home drive); `local.ts` adds WebGPU; settings `local`, `liveBudget`, `liveMode`; a new Settings tab "Local models" (hardware check, servers, installed Ollama models, HF link with sizes and a confirmed pull, fallback model, live mode); a budget field in Usage; `LiveView` uses `liveCtx` (budget only for cloud teachers) and `scriptBrain` in low mode, and suggests low mode when a local model takes over 20 s to start. en/ar strings.
- **Verified:** tsc clean; vitest 114/114. Tauri over CDP: the hardware check, the plan text, the HF file list for bartowski/Llama-3.2-1B-Instruct-GGUF, and "no local server" all render.
- **Unverified / open:** no live session has run on a local model, the budget switch has not been seen live, and low mode has not been heard live. The advice is based on RAM only and ignores GPU memory (this machine has a 6 GB Quadro RTX 3000, so Qwen3 14B would run mostly on the CPU). transformers.js linking is not built; the in-browser route is still WebLLM.
- **Next:** with the learner's OK, install Ollama, pull a small model (e.g. `llama3.2`, 2 GB), turn the network off and run a live session to close T-26; otherwise T-27.

## 2026-10-24T14:30:00+03:00 — T-25 done: voice options

- **State:** the learner picks who speaks (system voice, Piper on this machine, or a provider's realtime voice), how the mic listens (hold to talk, or always listening), and, in Arabic, MSA or a dialect. T-24 is committed as `3071bb4`; T-25 is not committed.
- **Did:** `settings.voice` = engine (system, piper, realtime), listen (hold, always), dialect (msa, egyptian, gulf, levantine, maghrebi), realtime provider (google, openai). New `mic.ts` (16 kHz mono frames), `vad.ts` (energy VAD with an adaptive noise floor, 2-frame start, 700 ms end, 300 ms pre-roll that does not count as speech, 300 ms minimum, 30 s cap, mute), `realtime.ts` (Gemini Live and OpenAI Realtime over WebSocket with the keychain key: a read-aloud voice and a transcriber, 24 kHz playback), `piper.ts` (piper-tts-web, voice kept in OPFS, ONNX runtime and phonemizer served by the app through `vite.config.ts`), `voice.ts` (`sessionVoice`: one pipeline per live session; any failure falls back to the system voice and Whisper with one notice). `LiveView` voice mode: always-listening keeps the mic open, the VAD is muted while the tutor speaks or thinks and while an answer is transcribed (echo handling), and a badge shows it. Captions now show spoken answer feedback. Engine: `dialectRule` and `DIALECT_NAME`; `llmBrain` takes `dialect` so the tutor speaks in everyday dialect and keeps the board, checks and feedback in MSA. CSP allows the Google and OpenAI realtime sockets. Settings has a voice card; new en/ar strings.
- **Gemini Live note:** the server ends a turn only after it hears silence, so `transcribe` adds 1.5 s of silence and returns the interim text if the final does not come (2.5 s after the last interim, 15 s overall). Without the silence it waited about 60 s and the socket closed.
- **Verified:** tsc clean (desktop, engine); vitest 101/101. Tauri over CDP with a fake mic playing recorded speech: always-listening in Arabic (Gemini, Egyptian) went listening, transcribing, speaking feedback, then back to "your turn", twice. Gemini read lines aloud (English in 4.7 s) and transcribed English and Arabic correctly. Piper's wasm, data and runtime files load from the app, and the module loads.
- **Unverified / open:** no Piper voice was downloaded (63 MB, needs the learner's OK), so Piper has not been heard. OpenAI Realtime is untested (no key). The VAD is energy-based, so loud speakers without headphones may still trigger it after the tutor stops. There is one Arabic Piper voice; dialects only change the realtime voice and the tutor's wording. Hold mode was not re-run live after the always-listening work.
- **Next:** the next pending task in `docs/04-tasks.md` (T-26, local mode).

## 2026-10-24T14:00:00+03:00 — T-24 done: learner sources beyond text

- **State:** learners can add images, audio, video, subtitle files and YouTube links as sources, and each is searchable with a locator a citation can point at. T-23 is committed as `9d61024`; T-24 is not committed.
- **Did:** new `packages/kb/src/media.ts`: `extractTranscript` groups timed speech into about 60-second sections located "m:ss–m:ss"; `parseSubtitles` (SRT, WebVTT); `parseTimedText` (YouTube classic and srv3); `youtubeId`; `fetchYoutubeTranscript` reads the caption track through the Android player endpoint, falling back to the watch page, preferring a written track in the learner's language; `extractImage` gives "text in the image" and "image description" sections. `SourceKind` gains image, audio and video. New `packages/engine/src/vision.ts` `readImage` asks the teacher model for OCR text and a description (JSON, one retry). Desktop `speech.ts` adds `transcribeTimed` (Whisper with timestamps, language detected). `Sources.tsx` routes files by type, asks before the first Whisper download, sends YouTube links to the transcript reader, and shows a file-types help line (en, ar).
- **Verified:** tsc clean (desktop, engine, kb); vitest 95/95. Tauri over CDP: a YouTube video gave 286 segments in 18 sections and a keyword search hit "4:09–5:11"; a canvas PNG read by vision gave correct text and description and was found; a WAV through cached whisper-tiny gave "0:00–0:04" and was found. The Sources screen in Arabic shows the help line and the new accept list.
- **Unverified / open:** downloading an online video for Whisper (decision 0002 item 19, approval-gated) is deferred; only the transcript route exists. Long audio or video is decoded whole in memory, so very long files may fail. Images need a teacher model with vision; others fail with the provider's message. Videos without captions are refused with a plain message. YouTube may change its player endpoint; the watch-page fallback covers some of that.
- **Next:** the next pending task in `docs/04-tasks.md`.

## 2026-10-24T13:45:00+03:00 — T-23 done: web search adapters

- **State:** new courses and the plan page can search the web through the learner's chosen route. T-22 is committed as `be997b4`; T-23 is not committed.
- **Did:** new `apps/desktop/src-tauri/src/browser.rs`, a visible "Kuttab: web search" window with no IPC (the capability lists only "main"). `browser_open` accepts http and https only. `browser_capture` evals a script that navigates to `https://kuttab.capture/?n=<nonce>&d=<json>`; `on_navigation` cancels that URL and hands the JSON to the waiting command, and only a nonce the host asked for is accepted. `browser_close` closes the window. A page load emits `browser-loaded` to main, and `web.open` waits for the load event from the requested host. Gateway `search.ts` adds key-based engines (SearXNG, Brave, Tavily, free options first), provider-native search (Gemini `google_search`, OpenAI `web_search`, Anthropic `web_search_20250305`), and DuckDuckGo HTML parsing (`uddg` decode, ads dropped). Desktop `web.ts` builds the engine `WebAdapter` from `settings.search.kind` (off, browser, native, or an engine) and asks for approval once per adapter. A refusal throws `SearchDeclined`; a declined course build falls back to the library. Settings has a web-search card under teacher tools, and engine keys are stored in the keychain as `key:search-<engine>`. The plan page has a "Find more sources" button that runs `searchMore` for the next objective. New en/ar strings.
- **Headless:** a "Search in the background" checkbox (`settings.search.headless`) opens the search window hidden (`browser_open` takes `visible`). The new `browser_show` command brings it into view when DuckDuckGo returns no results, so the learner can solve a challenge page.
- **Verified:** tsc clean (desktop, engine, llm-gateway); vitest 89/89. Tauri over CDP: headless, the window stayed hidden (`isVisible` false) for the whole search and both page reads. The browser adapter asked once, returned 4 DuckDuckGo hits and read Britannica and National Geographic pages (7.8k and 7.6k characters). The settings select lists all six options, and the plan page shows the button.
- **Unverified / open:** native and key-based search are mock-tested only; there is no Brave or Tavily key, and Gemini returned 429. A full course build with the browser route and the button click itself were not run live. DuckDuckGo may show a challenge page; the adapter says to solve it in the window and try again. The approval prompt uses `confirm()`. Page text from the window is split by blank lines only.
- **Next:** the next pending task in `docs/04-tasks.md` (T-24, learner sources).
## 2026-10-24T18:00:00+03:00 — T-22 done: track builder and resource pack

- **State:** a new course is researched once, and the result is kept as a resource pack that every later lesson reads instead of searching. T-21 is committed as `6e091ea`; T-22 is not committed.
- **Did:** new `packages/engine/src/track.ts`. `SourceMix` (none, mine, mine then web) and `KeepWeb` (pages or notes). `WebAdapter` is an interface only; the real adapters are T-23. `buildTrack` searches the learner's library, goes to the web only when the mix allows and own hits are thin (fewer than 3, or coverage under 0.5), has the model write 2 to 4 queries, fetches up to 6 pages (deduped, one failure does not fail the build), plans from both, and packs up to 4 excerpts per objective. Keep-pages copies the web pages into the library. `webSkipped` is recorded when the web was wanted and no adapter exists. `searchMore` is the mid-track search; it works on any mix and says plainly when no search provider is set up. `packHits` turns a pack into citable hits. Store key `resources/<planId>`; `Course.resources()`/`saveResources()`; deleting a course drops its pack. Desktop: the new-course form has a source-mix select in place of the checkbox. Lessons and Live read the pack through `stepHits` and fall back to a library search for older courses. The plan page shows a line saying what is saved for offline use. New en/ar strings.
- **Verified:** tsc clean (engine, desktop); vitest 80/80 (4 new in `track.test.ts`, with a fake web and a mock model). Tauri over CDP with the real model: a course built with "mine then web" shows "20 excerpts from 2 sources (1 from the web)". Its first lesson was generated with 0 library searches and cites "Critical thinking reference card" from the pack.
- **Unverified / open:** no real web research until T-23, so on the desktop "mine then web" builds from the library only. There is no desktop button for a mid-track search yet; it needs an adapter. Excerpts can repeat chunks of the same page. The "from the web" count includes url sources the learner added themselves.
- **Next:** the next pending task in `docs/04-tasks.md` (T-23, web search adapters).
## 2026-10-24T15:00:00+03:00 — T-21 done: live pace, back-to-plan nudges, skills map

- **State:** the live tutor changes pace from the lesson record and steers back to the plan after side questions; a Progress page shows a skills map per course. T-20 is committed as `e4ec14b`; T-21 is not committed.
- **Did:** new `packages/engine/src/adapt.ts`: `paceSignals` (first try per check, missed and right runs, side questions since the lesson last moved on, optional level), `paceFor` (2 missed in a row → slower, 3 right first time → faster; before any check, an earlier mastery score ≥ 0.6 → faster, under 0.3 → slower), `offPlan` (3 side questions), `paceRule` and `backToPlanRule`. `llmBrain` takes `level`; `nextBeat` adds the pace line, `reply` adds the back-to-plan line. Desktop: `LiveView` passes the objective's mastery score as `level` and shows a pace chip in the header when not steady. New `screens/Progress.tsx` (route `progress`, in the nav after Library): one card per course with a progress bar and a tile per step (state, score meter); a tile opens the plan. New en/ar strings.
- **Verified:** tsc clean (engine, desktop); vitest 76/76 (5 new in `adapt.test.ts`, including the prompts the model gets). Tauri over CDP: the Progress page shows the 4 courses with the right states and scores; opening Live on "Claims and evidence" (25%) shows "يبطئ الشرح"; the Arabic course at 0% shows no chip.
- **Unverified / open:** no real-model check that the tutor actually slows down or steers back; only the prompts are tested. Goals and dates pacing (decision 0002 item 20) is not done. A replayed paused reply's `say` could count as the lesson moving on.
- **Next:** the next pending task in `docs/04-tasks.md`.
## 2026-10-24T13:10:00+03:00 — T-20 done: learner memory and "What the tutor knows about me"

- **State:** the tutor keeps short facts about the learner on the device, learns more after each live session, reads them at the start of each session, and shows them on an editable page. Nothing committed since `bf3595b`.
- **Did:** new `packages/engine/src/memory.ts`: `LearnerMemory` (facts with text, optional `trackId`, `from` session/chat/you), `addFacts` (dedupe per scope, at most 30 per scope, your own facts kept longest), `memoryText` (global facts plus this course's), `learnFromSession` (structured model call, at most 4 new facts; falls back to unfixed mistakes when no model answers). Store key `memory`; `Course.memory()`/`saveMemory()`; deleting a course drops its facts. `llmBrain` takes `learner` and adds it to the system prompt. Desktop: `LiveView` passes the memory in and learns when the session ends (not cancelled by leaving the page); the done card links to the page. New `screens/Memory.tsx` (route `memory`, linked from Settings > About you): global and per-course facts, edit, delete, add. The chat tool `remember_learner_fact` now adds a global fact instead of appending to profile notes. Backup and erase already cover every store key. New en/ar strings.
- **Verified:** tsc clean (engine, desktop); vitest 71/71 (6 memory tests, including the prompt carrying the memory). Tauri over CDP with Gemini, Arabic: after a wrong answer and End, one global and one course fact appeared; editing, adding and deleting kept after a reload.
- **Unverified / open:** lesson and plan generation still read only profile notes, not the memory. Older facts saved by chat in profile notes were not moved over. The facts are what the model wrote; the learner can correct them on the page.
- **Next:** the next pending task in `docs/04-tasks.md`.
## 2026-10-24T11:10:00+03:00 — T-19 done: Read mode and live-session notes

- **State:** the lesson page is Read mode beside Live; after a live session it shows that session's notes. Nothing committed.
- **Did:** `LiveNotes` card in `apps/desktop/src/screens/LessonView.tsx` built from `lessonNotes` (engine `session.ts`): board snapshots, the learner's questions with replies, and mistakes (wrong answers, right answer, feedback, "you got it right later"). A board redrawn under the same title keeps only its last version. Links both ways: "Read mode" in the Live header, "Teach me live" on the lesson page, and a "Notes" button on the done card. Leaving the Live page now pauses the session instead of ending it, so going to Read mode and back resumes the same record. New en/ar strings.
- **Verified:** tsc clean (engine, desktop); vitest 65/65 (redraw test added). Tauri over CDP with Gemini, Arabic: after a question and a wrong answer, Read mode showed 2 boards, 1 question, 1 mistake, no sideways scroll; Live → Read → Live kept the same `startedAt` and re-asked the open check.
- **Unverified / open:** notes show the latest live session only; a new session after End replaces the record and its notes. One earlier round trip got a new record while an old HMR copy of LiveView was loaded; it did not happen again after a reload.
- **Next:** the rest of L1 in `docs/04-tasks.md`.

## 2026-10-24T10:30:00+03:00 — T-18 done: board tools (slide, image, animation, lab)

- **State:** the live board renders every `BoardKind`. Nothing committed.
- **Did:** board rendering moved from `LiveView.tsx` to `apps/desktop/src/components/Board.tsx`. New kinds: slide (titled card), image (data: URI or inline SVG; the SVG is cleaned with DOMPurify and shown as an `<img>`; web links are listed but not loaded), animation (markdown frames split by `---`, about 2.5 s per frame, back/play/next controls, no auto-play under reduced motion), lab (JSON `{language, code}` shown as the `run_code` widget, so "ask before running code" still applies). `BOARD_FORMATS` in `packages/engine/src/session.ts` tells the tutor how to write image, animation and lab content. CSS fix: the thumbnail row no longer makes the Live page scroll sideways (`minmax(0, 3fr)` and `min-inline-size: 0` on `.live-board`). New en/ar strings `playAnim` and `imageNotShown`.
- **Verified:** tsc clean (engine, desktop); vitest 64/64. In Tauri over CDP, five board actions were injected into a paused Arabic lesson, then removed and the record saved again. The slide and the SVG image rendered; the SVG's `<script>` was removed. The animation moved from frame 1 to 2 on its own. The Python lab ran and printed 2. The web image showed the "not shown" text with its link. Page width 1536/1536 after the CSS fix.
- **Unverified / open:** no real model has drawn image, animation or lab boards yet; only injected actions were tested. SQL labs were not run on the board.
- **Next:** T-19, Read mode and post-session notes from the lesson record.

## 2026-10-24T10:05:00+03:00 — Reload follow-ups to T-28: paused beat replayed, no duplicate check

- **State:** a reload now says a pause-cut beat again, and re-asking a restored check adds no `check` entry. Nothing committed.
- **Did:** `say` entries carry `paused: true` when pause cut them; `pausedBeat` in `packages/engine/src/session.ts` restores the last beat as `replay`. A restored check carries `logged`, so `speakCheck` skips the log. `pump` now plays a paused beat before asking a cut-off check (a paused reply at a check used to be replayed after the check).
- **Verified:** tsc clean (engine, desktop); vitest 64/64 with 3 new tests. Tauri over CDP: two reloads at an Arabic check kept 5 `check` entries; a reply paused mid-sentence was said again after a reload, with no new beat, then its check was asked.
- **Unverified / open:** records saved before this change have no `paused` flag, so they keep the old behaviour. A replayed beat appears twice in the chat (cut copy and replay), same as live pause/resume.
- **Next:** T-18, board tools.

## 2026-10-24T09:50:00+03:00 — T-28 done: an open check survives an app reload

- **State:** `LiveSession` given an unended record finds its open check (`openCheck` in `packages/engine/src/session.ts`) and asks it again before anything new. Nothing committed.
- **Did:** the open check is the last beat with a check, when it has no right answer and only replies came after it. It is restored as a cut-off check, so the existing pump path re-asks it and waits.
- **Verified:** tsc clean; vitest 61/61, including a new test (fails without the fix: the tutor moved on). Tauri over CDP: two reloads at an Arabic check showed the same check and choices.
- **Unverified:** a pause mid-beat before a reload still restarts at the next beat (not replayed). Each reload logs one more `check` entry for the re-ask.
- **Next:** the rest of L1.

## 2026-10-24T09:40:00+03:00 — T-17 done: Live Voice (orb) mode

- **State:** the Live screen has a Chat/Voice toggle in its header. Voice mode is `VoicePanel` in `apps/desktop/src/screens/LiveView.tsx` with orb styles at the end of `styles.css`. Nothing committed.
- **Did:** an orb with idle/listening/thinking/speaking looks, a state label, a caption (the sentence being spoken, else the open check), choice buttons, and hold-to-talk by pointer or Space/Enter. Pressing stops the voice (pausing if the tutor was talking); releasing transcribes with local Whisper and sends the text, resuming if nothing was heard. At a check there are two buttons: "hold to answer" (graded) and "hold to ask" (a question; the check is asked again). Voice mode always speaks, so the read-aloud checkbox shows in Chat mode only. "No microphone" message when MediaRecorder is missing.
- **Verified:** tsc clean (engine, desktop); vitest 60/60. Live in Tauri over CDP: an Arabic SAPI WAV was fed as the mic stream and the button held with real mouse events. Mid-speech → pause, question, resume, reply, back to the check. At a check, "ask" logged a question and "answer" graded. RTL layout checked by screenshot.
- **Unverified:** a real microphone (only the stubbed stream was tested); Whisper tiny mis-hears synthetic Arabic ("ما هو التفكير النقدي" came out as "مهوة في كير النقدية"), and `base` may be needed for Arabic; Whisper tiny was downloaded once (about 40 MB) during the test.
- **Next:** T-28 (restore a waiting check after reload), then the rest of L1.

## 2026-10-24T09:25:00+03:00 — T-16 done: Live screen, Chat mode

- **State:** "Teach me live" on each plan step opens `apps/desktop/src/screens/LiveView.tsx` (route `live`). Nothing committed.
- **Did:** chat column (tutor lines, learner questions, answers with ✓/✗ and feedback, check card with choice buttons), board pane with history thumbnails, read-aloud per sentence (system voices; a timed pause when off) with the current sentence highlighted, Pause/Resume, Explain again (asked as a question, not graded), End, mic input. The record is saved per step (`course.liveRecord`/`saveLiveRecord`) and resumed if not ended. Engine fix: `kick()` left a finished pump's handle set when `pump()` returned synchronously, so End did nothing after pause → resume at a check; checks are now cleared on finish. Regression test added.
- **Verified:** tsc clean (engine, desktop); vitest 60/60. Live in Tauri over CDP with Gemini `gemini-flash-lite-latest`: English (beats, board history, right answer, interrupt mid-check) and Arabic RTL (wrong answer keeps the check with a hint, pause/resume, End shows the done card).
- **Unverified:** OpenCode Go (the `.env` key is rejected: "Invalid credential"); a pending check is not restored after an app reload (the tutor moves on).
- **Next:** T-17 Voice (orb) mode.

## 2026-10-24T08:55:00+03:00 — T-15 done: live session engine

- **State:** `packages/engine/src/session.ts` holds the L1 session loop; no UI uses it yet. Nothing committed.
- **Did:** zod `Beat` (say + optional board action + optional check). `LiveSession` with states idle/thinking/speaking/awaiting_answer/paused/done; `start`, `answer`, `interrupt`, `pause`, `resume`, `end`; speech and beat source injected (`Speaker`, `TutorBrain`). Interrupt cuts speech, replies, then carries on; a cut-off check is still asked. Pause replays the cut beat. Choice checks are graded locally, free answers by the brain; a wrong answer keeps the check open and says the hint. One `LessonRecord` with read helpers (`boardHistory`, `checkResults`, `learnerQuestions`, `transcript`). Brains: `scriptedBrain` (pack sections, tests) and `llmBrain` (one structured beat per call).
- **Verified:** tsc clean; vitest 59/59, 8 of them in `packages/engine/test/session.test.ts`.
- **Unverified:** `llmBrain` only against a mock model, not a live provider.
- **Next:** T-16 Live screen (Chat mode) on top of `LiveSession`.

## 2026-10-24T08:30:00+03:00 — Live tutor decided (0002) and planned as L1–L5

- **Did:** brainstormed the live tutor with the owner; prototype `spikes/live-tutor/prototype.html` approved; decision 0002 accepted (26 items: voice pipelines, hold-to-talk, board, browser search, local mode, memory-based self-improvement, learner sources, goals, profiles). Added milestones L1–L5 to docs/01-project.md and tasks T-15..T-27.
- **Next:** start T-15 (session engine) when the owner asks.
- **Artifacts:** docs/09-decisions/0002-live-tutor.md, spikes/live-tutor/prototype.html, docs/04-tasks.md.

## 2026-10-18T12:50:00+03:00 — T-13 done: backup import in Settings > Privacy

- **State:** Settings > Privacy and data has an "Import a backup" card under Export. Nothing committed.
- **Done:** `apps/desktop/src/backup.ts` holds the format (`{app:"kuttab", exportedAt, data}`). Export and import both use it. Import checks the size (200 MB cap) and the shape. It refuses any `key:` entry, so keys stay in the keychain only. It asks to confirm with the date and item count, replaces the whole store, then reloads. The en and ar strings cover all four error cases.
- **Evidence:** `apps/desktop/test/backup.test.ts`. tsc clean, vitest 51/51. Live in Tauri over CDP: backup with 18 keys, Fractions keys deleted, Library showed 2 courses, imported through the file input, Library back to 3 courses and 18 keys. A wrong-app file and a file with a key both showed their error text.
- **Next:** pick the next pending task in `docs/04-tasks.md`.

## 2026-10-18T12:40:00+03:00 — T-12 done: the tutor is an agent with visual tools

- **State:** M5 done. The tutor calls tools in chat; charts and Mermaid diagrams render live in Tauri with OpenCode Go longcat. Nothing committed.
- **Did:** engine `tools.ts`: 7 built-in tools (show_chart, show_diagram, show_math, quiz_card, run_code, lookup_sources, remember_learner_fact), zod inputs, `tutorAgent` loop on `streamText` + `stopWhen`. Gateway `supportsTools()`; models without tools get plain chat, and a provider that rejects tools retries plain. Desktop `Widgets.tsx` (SVG chart, lazy Mermaid + KaTeX, DOMPurify), Settings > Teacher tools tab (per-tool switches, ask before running code).
- **Verified:** vitest 49/49, tsc OK. CDP in tauri dev: one reply drew `.widget.chart svg` and a Mermaid svg with 7 SVG text labels.
- **Unverified / open:** quiz, math and code widgets not driven live; Gemini tool calls untested. Mermaid HTML labels are off (DOMPurify emptied foreignObject).
- **Next:** T-13 backup import.
- **Blockers:** none.
- **Artifacts:** packages/engine/src/tools.ts, apps/desktop/src/components/Widgets.tsx, packages/engine/test/tools.test.ts.
<!-- rotate:end -->

Rotated entries: `docs/handoff/archive-2026.md`. Rotation moves; it never deletes.
