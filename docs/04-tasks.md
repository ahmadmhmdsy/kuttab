# 04 — Tasks (live status)

**Contract**
- **Role:** the current truth about what is being worked on.
- **Mutability:** **rewritten in place.** This is the one document where editing
  history is correct — the table always shows the present.
- **Read when:** session start.
- **Update when:** a task starts, finishes, changes owner, or becomes gated.

**Statuses:** pending | in_progress | blocked | done.
**Blocked always names its gate.** A task waiting on a user decision is blocked,
not in_progress.

---

## Columns

| Column | Meaning |
|---|---|
| id | stable identifier; never reused |
| title | what it delivers, in one line |
| status | the task's workflow state — `docs/00-schema.md` owns the values |
| owner | who is accountable right now |
| scope | the paths this task may modify — required when more than one writer is active |
| gate | what unblocks it, or the immediate next step |
| evidence | the artifact that proves the status — required for done |

**Evidence rule:** a row marked done with an empty Evidence cell is not done.
Cite the command, file, or run that proves it.

**Pre-registration rule:** write the acceptance criterion before starting work
that is expensive or hard to reverse. A criterion invented afterwards is not a
criterion.

## Now

Only `Now` and `Blocked` rows stay inline. Completed rows move verbatim to
`docs/tasks/archive-2026.md`; rotation moves, it never deletes. The column order
is fixed by `_templates/task-row.md`, so a row can be copied from that form.

<!-- rotate:begin -->
| id | title | status | owner | scope | gate | evidence |
|---|---|---|---|---|---|---|
| T-3 | M0 spike: Tauri 2 + AI SDK via tauri-plugin-http streams from OpenAI, Anthropic, Ollama | blocked | claude | spikes/llm/ | pass = streamed text + generateObject from all 3 | spikes/llm/RESULTS.md (transport PASS ×3, mock-Ollama stream+object PASS; real stream/object SKIPPED: no keys, no Ollama) |
| T-4 | M0 spike: Pyodide + sql.js in workers behind a draft LabRuntime interface, with timeout/kill | pending | claude | spikes/labs/ | pass = infinite loop killed, tests graded | - |
| T-5 | M0 spike: Arabic RTL demo screen (mixed Arabic + code, dir=auto, logical CSS) | pending | claude | spikes/rtl/ | pass = no mirrored code in WebView2 | - |
| T-6 | M0 spike: embedding benchmark en+ar (multilingual-e5-small vs bge-m3) | pending | claude | spikes/embed/ | pass = recall@5 table recorded | - |
| T-7 | Decide open questions: timeline, repo name/visibility, app id + code signing | blocked | owner | docs/01-project.md | owner answers | - |
| T-14 | Release pipeline (M6): CI builds for 3 OSes, signing, updater | blocked | owner | .github/, apps/desktop/src-tauri/ | T-7 answers (app id, signing certs) | - |
| T-18 | L1: board tools — slides, diagrams, animations, labs on the board | done | claude | apps/desktop/src/, packages/engine/ | pass = each board kind rendered in a live session | Tauri CDP 2026-10-24: slide, SVG image, 3-frame animation (auto-steps), Python lab ran (output 2), web image link shown; tsc clean, vitest 64/64 |
| T-19 | L1: Read mode and post-session notes from the lesson record | done | claude | apps/desktop/src/screens/ | pass = notes page shows board snapshots, questions, mistakes | Tauri CDP: Gemini Arabic session, Read mode showed 2 boards, 1 question, 1 mistake; Live→Read→Live kept the same record and re-asked the check; vitest 65/65 |
| T-20 | L2: learner profile + "What the tutor knows about me" page, in backup and erase | done | claude | packages/engine/, apps/desktop/src/ | pass = profile updates after a session and is editable | Tauri CDP: Gemini Arabic session ended, then 1 global and 1 course fact were learned and shown on the page; edit, add and delete kept after a reload; vitest 71/71 |
| T-21 | L2: adaptation signals, back-to-plan nudges, progress skills map | done | claude | packages/engine/, apps/desktop/src/ | pass = tests show pace change on signals | `adapt.test.ts` (5 tests): missed and first-try runs change the pace and the next-beat prompt, side questions add the back-to-plan line; vitest 76/76; Tauri CDP: Progress page shows 4 course skill maps, a 25% objective opens Live with the "slowing down" chip |
| T-22 | L3: track builder — research once, resource pack, source-mix setting, mid-track search | done | claude | packages/engine/, packages/kb/ | pass = new track built offline-reusable | `track.test.ts` (4 tests): research runs once, the saved pack reloads and feeds every objective with no search or fetch, only-mine never touches the web, keep-pages adds pages to the library, a mid-track search works on any mix; vitest 80/80; Tauri CDP: a new course (mine then web) shows "20 excerpts from 2 sources" saved for offline use, and its first lesson is generated with 0 library searches and cites the pack |
| T-23 | L3: search adapters — in-app browser with approval, provider-native, key-based | done | claude | apps/desktop/src-tauri/, packages/llm-gateway/ | pass = each adapter returns results | `search.test.ts` (9 tests, mocked HTTP): Brave, Tavily, SearXNG, Gemini, OpenAI and Anthropic each return hits, plus DuckDuckGo link decoding; vitest 89/89. Tauri CDP, live: the browser adapter asked for approval once, returned 4 DuckDuckGo results for "how does photosynthesis work" and read 2 pages (about 7.5k characters each); the same run with the headless setting kept the window hidden (`isVisible` false). Native and key-based search are not checked live: there is no Brave or Tavily key, and the Gemini key is out of quota |
| T-24 | L3: learner sources — images (OCR, vision), audio/video transcripts, online video transcript | done | claude | packages/kb/, packages/engine/, apps/desktop/ | pass = each source type searchable | `media.test.ts` (6 tests): times and windows, SRT/VTT, both YouTube timed-text forms, video ids, mocked caption fetch with language choice, and every media kind found by search; vitest 95/95. Tauri CDP, live: a YouTube talk gave 286 caption segments in 18 timed sections and a search hit "4:09–5:11"; a PNG read by the teacher model's vision gave the right text and description and was found; a WAV through whisper-tiny gave "0:00–0:04" and was found. Downloading an online video (needs approval) is deferred |
| T-25 | L4: voice options — realtime providers, VAD always-listening, Piper, dialects | done | claude | apps/desktop/src/, packages/engine/ | pass = each option works in a live session | `voice.test.ts` (VAD: one utterance with pre-roll, a cough dropped, muting, fan noise ignored, long speech split; PCM helpers) and `dialectRule` tests; vitest 101/101. Tauri CDP, live: always-listening in Arabic with Gemini Live heard a spoken answer, transcribed it in about 2 s, graded it and spoke the feedback; Gemini Live read English and Arabic lines aloud. Piper is wired up to the voice download (63 MB, waits for the learner's OK) and not heard yet; OpenAI Realtime is untested (no key) |
| T-26 | L4: local — hardware check, HF/OpenAI-compatible linking, session budget switch, low-compute mode | pending | claude | apps/desktop/src/, packages/llm-gateway/ | pass = full local session with no network | - |
| T-27 | L5: image generation, tutor looks, goals and reminders, several profiles | pending | claude | apps/desktop/ | pass = each feature usable; profile locks still undecided | - |
<!-- rotate:end -->

## Blocked

None. A blocked row stays in the live table above with `status: blocked` and a
`gate` that names what unblocks it.
