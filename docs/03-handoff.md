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
## 2026-10-24T21:00:00+03:00 — T-28 done: accessibility, CI, README; repo public

- **State:** T-27 is `68341e0`; T-28 is committed with the README and pushed to the new public repo `github.com/ahmadmhmdsy/kuttab`.
- **Built:** accessibility fixes (named progressbars with values, heading order, labels on the dialect, UI-language and budget inputs, a CodeMirror label `codeEditor`); `.github/workflows/app.yml` (checks, then unsigned Tauri builds on three systems, no secrets); a showcase README with screenshots in `docs/media/`.
- **Verified:** axe-core over CDP shows 0 violations on every screen (English UI); typecheck; vitest 128/128; the local release compile was still running at commit time.
- **Unverified / open:** the first CI run on GitHub is not checked yet. `context.yml` runs `rotate.py --check`, which fails on the oversized T-26 entry (append-only, older than this task). Signing, the updater host and the identifier `dev.kuttab.app` wait on the learner's decisions.
- **Next:** read the first CI run; decide the M6 items.

## 2026-10-24T18:00:00+03:00 — T-27 done: images, looks, goals and reminders, several learners

- **State:** T-27 built and checked in the app; not committed (T-26 is `9a25cf5`).
- **Built:** an image model role (`llm-gateway/src/image.ts`: OpenAI and compatible servers through the AI SDK, Gemini `generateContent`, Imagen `predict`); the teacher's `make_image` tool and `gen:` board prompts (`drawBoard`), only offered when an image model is set; every image shows its source and an AI-image notice. Tutor looks orb / face / character (`TutorAvatar.tsx`). A finish date per course (`engine/src/goal.ts`) with a pace pill, a reminder banner on open and the goal in the tutor's learner note. An opt-in tray (`src-tauri/src/tray.rs`, autostart with `--tray`, notification plugin) that sends one reminder notice when started hidden; closing the window hides it while the tray is on. Several learners: data under `p/<id>/`, a header switcher, add/switch/delete in Settings → Learning; no PIN.
- **Verified:** typecheck, vitest 128/128, `cargo check`. Tauri CDP: a goal 3 days out showed "on track · about 8.8 a week" and the banner after reload; a new learner got the welcome screen with empty data, switching back kept the main learner's goal, delete worked; the character look preview rendered.
- **Unverified / open:** no live generated image — GOOGLE_API_KEY reached Google but `gemini-2.5-flash-image` returned a quota error (no free tier for image models); a paid key or an OpenAI-compatible image server is needed. Tray startup and OS notifications were not run (needs autostart at login). The character's hair draws in the skin colour. Profile locks stay undecided.
- **Next:** commit T-27; get a key that can make images to see one live.

## 2026-10-24T18:00:00+03:00 — T-22 done: track builder and resource pack

- **State:** a new course is researched once, and the result is kept as a resource pack that every later lesson reads instead of searching. T-21 is committed as `6e091ea`; T-22 is not committed.
- **Did:** new `packages/engine/src/track.ts`. `SourceMix` (none, mine, mine then web) and `KeepWeb` (pages or notes). `WebAdapter` is an interface only; the real adapters are T-23. `buildTrack` searches the learner's library, goes to the web only when the mix allows and own hits are thin (fewer than 3, or coverage under 0.5), has the model write 2 to 4 queries, fetches up to 6 pages (deduped, one failure does not fail the build), plans from both, and packs up to 4 excerpts per objective. Keep-pages copies the web pages into the library. `webSkipped` is recorded when the web was wanted and no adapter exists. `searchMore` is the mid-track search; it works on any mix and says plainly when no search provider is set up. `packHits` turns a pack into citable hits. Store key `resources/<planId>`; `Course.resources()`/`saveResources()`; deleting a course drops its pack. Desktop: the new-course form has a source-mix select in place of the checkbox. Lessons and Live read the pack through `stepHits` and fall back to a library search for older courses. The plan page shows a line saying what is saved for offline use. New en/ar strings.
- **Verified:** tsc clean (engine, desktop); vitest 80/80 (4 new in `track.test.ts`, with a fake web and a mock model). Tauri over CDP with the real model: a course built with "mine then web" shows "20 excerpts from 2 sources (1 from the web)". Its first lesson was generated with 0 library searches and cites "Critical thinking reference card" from the pack.
- **Unverified / open:** no real web research until T-23, so on the desktop "mine then web" builds from the library only. There is no desktop button for a mid-track search yet; it needs an adapter. Excerpts can repeat chunks of the same page. The "from the web" count includes url sources the learner added themselves.
- **Next:** the next pending task in `docs/04-tasks.md` (T-23, web search adapters).

## 2026-10-24T16:00:00+03:00 — T-26 done: a live session on a local model with no network

- **State:** with the learner's OK, Ollama 0.40.10 is installed (winget) and `llama3.2` (2.0 GB) is pulled; it runs fully on the GPU. T-26 is done but not committed (T-25 is `ace5b21`).
- **Verified:** Tauri over CDP, teacher and local set to ollama:llama3.2, with in-app fetch and WebSocket blocked for every non-loopback host. Live mode: 7 calls, all to `localhost:11434/v1/chat/completions`, 0 sockets; the webview loaded only localhost:1420 and ipc.localhost; header showed $0.0000 · 9,571 tokens; a typed answer was graded by llama3.2. Afterwards the OS listed no Google connection from the app's processes (the one left, 40.104.205.2, belongs to the WebView2 runtime). Low mode: one call wrote the whole script and the session read the beats up to "دورك".
- **Gotcha:** the first run was not local: the T-25 voice setting (Gemini Live realtime, always listening) taught the session over a WebSocket. A local session needs the voice on the system voice or Piper; the app does not switch it by itself yet.
- **Unverified / open:** the network adapter was not turned off (a system setting); offline was shown by blocking in-app and checking the OS. llama3.2 teaches poorly (repeated questions, a board titled "3."), so a larger model is advised for real use. The 20 s slow-model notice did not fire (fast GPU). The budget switch was not seen live with a cloud model.
- **Settings:** restored after the test — teacher back to google:gemini-flash-lite-latest, voice back to Gemini realtime / always / Egyptian, live mode "live"; local fallback left at ollama:llama3.2.
- **Next:** decide whether a local session should force a local voice; then T-27.
<!-- rotate:end -->

Rotated entries: `docs/handoff/archive-2026.md`. Rotation moves; it never deletes.
