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
<!-- rotate:end -->

## Blocked

None. A blocked row stays in the live table above with `status: blocked` and a
`gate` that names what unblocks it.
