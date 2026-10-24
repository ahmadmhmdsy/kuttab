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
