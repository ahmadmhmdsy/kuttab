# 07 — Sources of truth

**Contract**
- **Role:** for each kind of fact, which artifact is authoritative.
- **Mutability:** rewrite in place.
- **Read when:** before reporting any number or status.
- **Update when:** the authoritative artifact for something changes.

**Why this file exists:** most false claims are not lies — they come from two
sources disagreeing and the agent picking the convenient one. Naming the winner
in advance removes the choice.

---

## Register

| Fact / number | Authoritative source | How to read it | Never rely on |
|---|---|---|---|
| Build status | GitHub Actions run for the commit (no CI yet → UNKNOWN) | `gh run list` | a remembered result |
| Test results | `pnpm test` output this session (no code yet → UNKNOWN) | run it | a summary in a doc |
| Release state | GitHub Releases page (none yet) | `gh release list` | a local assumption |
| Current branch / commit | the version-control system | | a document that names a commit |
| Task status | docs/04-tasks.md | | chat history |
| Project state | docs/03-handoff.md (newest entry) | | an older entry |
| Machine facts | docs/02-environment.md | | intuition |
| Product scope | docs/01-project.md | read it | research/analysis.md (background only) |
| Competitive facts | research/analysis.md (dated 2026-10-17) | read it; re-verify before quoting | memory |

## Reporting protocol

1. Before stating a number, identify its source in this register.
2. Read the source. Do not recall it.
3. Cite the source in the report.
4. If two sources disagree, the register decides. If the register is silent,
   stop and ask — do not choose.
5. If a source is unavailable, report SKIPPED with the reason. Never substitute
   a plausible value.
6. Between two readings of the same source, the freshest verification timestamp
   wins. A fact that cannot be verified this session renders `UNKNOWN` and never
   inherits an older value.

## Derived values

None yet. When evals (S3–S7 in docs/01-project.md) exist, their results live in
the CI run that produced them, reproduced by one `pnpm` script named here. Two sessions MUST NOT be able to produce two different values
for the same reported quantity.
