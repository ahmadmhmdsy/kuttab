# general — memory shard

Lessons that do not belong to a narrower topic.

- **2026-10-18 — OpenCode Go needs a session header.** Without `x-opencode-session` it answers 400 MissingSessionID (earlier a bare 500). Send it plus a User-Agent; one id per app run keeps its cache warm. Use base `https://opencode.ai/zen/go/v1` (the `/inference/go/openai/v1` base has no `/models`).
- **2026-10-18 — json_object providers do not see the schema.** With `supportsStructuredOutputs: false` the AI SDK sends only `response_format: json_object`; put `z.toJSONSchema(schema)` in the instructions or the model guesses field names.
- **2026-10-18 — Reasoning models spend tokens before answering.** longcat returns `reasoning_content`; a 16-token Test budget ends in `length` with no text. Budget at least ~512.
- **2026-10-18 — AI SDK v7 renames.** `generateObject` -> `generateText({ output: Output.object({ schema }) })` and read `r.output`; `system` -> `instructions`.

