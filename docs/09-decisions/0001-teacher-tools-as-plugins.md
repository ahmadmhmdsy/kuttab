# 0001 — Teacher tools are built-in plugins with one registration shape

- **Status:** accepted
- **Date:** 2026-10-18T12:30:00+03:00
- **Decided by:** owner
- **Supersedes:** none

**Contract**
- **Mutability:** immutable once accepted; a change is a new record that supersedes this one.

## Context

The tutor was structured generation plus plain chat. The owner wants a teacher that
shows charts, diagrams and animations, quizzes inline and runs code, and wants the
design to scale like deepseek-harness ("everything is a plugin", built on Cordis:
plugins declare what they need, and turning one off disposes all it set up). Kuttab
is a desktop app holding the learner's API keys under a strict CSP, with no server.

## Decision

Every teacher tool is a plugin registered through one `defineTool()` (name,
description, zod input, optional `run`, optional widget kind), shipped inside the
app. The tutor uses AI SDK tool calling with a step limit, and falls back to plain
chat for models without tool calls. The learner switches each tool in Settings.

## Alternatives considered

| Alternative | Why it was not chosen |
|---|---|
| Adopt Cordis or deepseek-harness as a dependency | dsh is a developer preview with announced breaking changes; a runtime framework is more than a dozen tools need |
| Load third-party plugins now | untrusted code next to keychain keys needs a sandbox and permission model first |
| Keep plain chat and add visuals to lessons only | the teacher could not react to the learner with a picture or a quiz mid-conversation |

## Consequences

**Positive**

- New tools, lab languages and widget kinds plug in without touching the loop.
- Visual libraries are bundled, so CSP stays strict and it works offline.

**Negative**

- Small local models call tools poorly; the fallback path must stay good.
- Third-party plugins remain future work (needs sandbox + manifest permissions).
