# 06 — Glossary (domain language)

**Contract**
- **Role:** the canonical meaning of project-specific terms.
- **Mutability:** append-only. Redefining a term requires a new row and a note
  on the old one.
- **Read when:** a domain term is unclear, or before naming anything new.
- **Update when:** a term is coined, imported, or redefined.

**Why this file exists:** agents confidently misuse domain vocabulary, and
every downstream artifact inherits the misuse. One table prevents it.

---

| Term | Meaning here | Not to be confused with | Source |
|---|---|---|---|
| Kuttab | this app (كُتّاب, a traditional Quran/literacy school) | the `.kuttab` file format | docs/01-project.md |
| pack | a course pack: a `.kuttab` folder/zip with `pack.yaml`, `objectives.yaml`, `kb/`, `lessons/`, `labs/`, `i18n/` | an npm package | research/analysis.md §5 |
| objective | one node of the learning plan graph; mastery is tracked per objective | a lesson | research/analysis.md §5 |
| lesson block | a typed unit of a lesson: explain, worked_example, check, exercise, recap | a chat message | research/analysis.md §5 |
| lab | a runnable exercise executed in-app by a lab runtime (SQL, Python) | a lesson | docs/01-project.md |
| lab runtime | a plugin implementing the shared lab interface (run, test, reset, timeout) | a provider | docs/01-project.md |
| provider | an LLM source: cloud key, local server, or in-browser model | a lab runtime | docs/01-project.md |
| model role | teacher, grader, or embedder — which model does which job | a provider | docs/01-project.md |
| grounded mode | tutor answers only from the learner's sources, with citations, else refuses | ordinary chat | docs/01-project.md |
| BYOK | bring your own key/model; the app ships no model and no server | free tier | docs/01-project.md |
| task | a tracked unit of work with an ID, a status, and an owner | a to-do note | docs/04-tasks.md |
| agent | an autonomous or semi-autonomous worker operating in this repository | a process or service | AGENTS.md |
| durable | survives the session because it is written to a file in this repository | cached, in memory | rules/15 |

## Rules

- **Canonical spelling.** One spelling per term; list variants as "also seen
  as". Inconsistent spelling breaks search.
- **Define by use, not by dictionary.** What does it mean *in this project*?
- **Name the near-miss.** The most useful column is what the term is commonly
  confused with.
- **Add the term the first time it is used ambiguously** — that is when the
  cost of not defining it is visible.
