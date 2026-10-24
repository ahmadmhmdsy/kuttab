# Task archive -- 2026

Completed task rows, moved verbatim from `docs/04-tasks.md`. Rotation moves; it never deletes.

| id | title | status | owner | scope | gate | evidence |
|---|---|---|---|---|---|---|
| T-1 | Competitive analysis of DataCamp AI-native + alternatives | done | claude | research/analysis.md | - | research/analysis.md |
| T-2 | Brainstorm and lock product scope in docs/01-project.md | done | claude | docs/01-project.md | - | docs/01-project.md |
| T-8 | Build the MVP: desktop app, engine, llm-gateway, labs, kb, 6 sample packs (SQL, Python, critical thinking × en/ar) | done | claude | apps/desktop/, packages/, packs/ | - | docs/03-handoff.md |
| T-10 | Harden the CSP in apps/desktop/src-tauri/tauri.conf.json (was `null`) | done | claude | apps/desktop/src-tauri/tauri.conf.json, apps/desktop/vite.config.ts, apps/desktop/src/speech.ts | - | docs/03-handoff.md |
| T-9 | Tauri runtime smoke test: `pnpm tauri dev`, keychain secrets, SQLite kv, file export | done | owner | apps/desktop/src-tauri/ | pass = key saved and reloaded across restart, progress persists, export writes a file | docs/03-handoff.md |
| T-11 | Exercise LLM features (tutor chat, reflect grading, plan generation) against a real provider | done | owner | packages/llm-gateway/, apps/desktop/ | owner supplies an API key or a local server | docs/03-handoff.md |
| T-12 | Teacher agent (M5): tool registry, agent loop, chart/diagram/math/quiz/code/sources/memory tools, chat widgets, Settings > Teacher tab | done | claude | packages/engine/, packages/llm-gateway/, apps/desktop/src/ | pass = tutor reply renders a chart and a diagram in tauri dev; vitest green | packages/engine/test/tools.test.ts |
| T-13 | Backup import (pairs with Settings > Privacy export) | done | claude | apps/desktop/src/ | after T-12 | apps/desktop/test/backup.test.ts |
| T-15 | L1: session engine — beats (say + board action + check), interrupt, pause, resume; one lesson record | done | claude | packages/engine/ | pass = unit tests drive a scripted session incl. interrupt and check | packages/engine/test/session.test.ts |
| T-16 | L1: Live screen — Chat mode with streamed read-aloud per sentence, board pane with history, follows prototype | done | claude | apps/desktop/src/screens/ | pass = live run in Tauri, en + ar | apps/desktop/src/screens/LiveView.tsx (Tauri live run en+ar over CDP, Gemini); vitest 60/60 |
| T-17 | L1: Voice (orb) mode — hold-to-talk, captions, states, interrupt | done | claude | apps/desktop/src/ | pass = spoken question answered in Tauri | Tauri over CDP, 2026-10-24: Arabic WAV fed as the mic; held mid-speech → pause, transcribe, question, reply, resume to the open check; at a check "hold to ask" logs a question (not an answer) and the check returns; "hold to answer" grades |
| T-28 | L1 bug: restore a waiting check after an app reload (today the saved record resumes but the open check is lost and the tutor moves on) | done | claude | packages/engine/src/session.ts, apps/desktop/src/screens/LiveView.tsx | pass = reload mid-check in Tauri shows the same check; engine test restores `pending` from the record | engine test "a saved record with an open check asks that check again"; Tauri over CDP 2026-10-24: two reloads at an Arabic check reopened the same check, no new beat |
