# 0002 — Live tutor: agent-led sessions with voice, board and researched tracks

- **Status:** accepted
- **Date:** 2026-10-24T08:00:00+03:00
- **Decided by:** owner
- **Supersedes:** none

## Context

The owner finds the app feels like a question-and-answer tool: the lesson is a
generated page and the tutor only speaks when asked. They want an agent that leads
the session in real time (teaches, discusses, brainstorms), in a chat mode with
read-aloud and a voice-only "orb" mode, with a board beside it that shows what the
agent makes as it teaches. Tracks come from a pack, or the agent researches the web
once and builds the plan and a per-section resource pack. Teaching adapts to the
learner. The prototype `spikes/live-tutor/prototype.html` was approved on 2026-10-24.

Kuttab stays local-first: no server, keys in the OS keychain, no telemetry.

## Decision

Build a live tutor around one session loop of beats (speech + board action +
optional check), shown as Chat or Voice (orb) with the board on the end side.
Owner answers so far:

1. **Voice pipeline:** both, learner chooses. (a) speech-to-text, then LLM, then
   text-to-speech, sentence by sentence; (b) provider realtime voice (OpenAI
   Realtime, Gemini Live).
2. **Talking to the tutor:** hold-to-talk is the default; "microphone always
   listens" is an option (needs voice activity detection and echo handling).
3. **Board:** text, slides, diagrams, animations, web images and generated images.
   The learner runs the app locally and is responsible for licensing; the app
   states this clearly and shows each item's source. Image generation is a model
   the learner configures (cloud or local); unconfigured means the tool is absent.
4. **Web research:** provider-native search and the learner's own search keys,
   free options first, plus a "use my browser" route that needs only the learner's
   approval. Storage per learner choice: full page copies or notes plus links.
5. **Lesson page:** kept as Read mode beside Live, and rebuilt after each live
   session as the learner's notes (board snapshots, questions, mistakes). One
   lesson record feeds Live, Read and Review.
6. **Cost:** a live session has its own spending limit, separate from the global
   one. When it runs out, the app tells the learner it is switching to the local
   model, then switches.
7. **Local live mode:** a fully local, free setup must work: Whisper, a local LLM
   (Ollama, or any local or Hugging Face model the app can already link), OS
   voices or Piper, Silero VAD. The app checks the hardware and recommends model
   sizes before any download. If live is too slow or poor, it offers pipeline (a).
   Low-compute mode: the main model writes the section, a TTS model reads it.
   Any model strength must work, from small local to large cloud.
8. **Browser search:** an in-app browser window; the learner sees and approves,
   solves any CAPTCHA, and the agent reads the pages. No key needed.
9. **Teacher:** the teacher is always an AI model; there is no human teacher role.
10. **Adaptation:** no placement quiz; the tutor works out the level as it goes.
11. **Off-plan talk:** the tutor brings the learner back to the plan after a while.
12. **Arabic voice:** Modern Standard Arabic and dialects, learner chooses.
13. **Tutor look:** the orb and other looks (character, face), learner chooses.
14. **Self-improvement:** the tutor learns the learner from lessons, chats and
    brainstorms, stored locally, to teach them better over time.
15. **Learner sources:** when creating a track the learner can add books, files,
    images, URLs, videos and audio as sources. Files are extracted and indexed in
    kb; images get OCR and a vision description; URLs are fetched or read via the
    in-app browser; audio and video are transcribed by local Whisper with times.
16. **Model linking:** Ollama (including `hf.co/...` models), any OpenAI-compatible
    local server (LM Studio, llama.cpp), and small in-app transformers.js models.
17. **Self-improvement is memory, not training:** a local learner profile built
    from post-session notes, read at session start, and shown on an editable
    "What the tutor knows about me" page; included in backup, removed by erase.
    Profile knowledge is both global and per track.
18. **Source mix:** chosen when creating the track (only mine / mine first then web).
    A mid-track "search the web" request is always honored, whatever the choice.
19. **Online video:** transcript by default; downloading the video is an option
    that needs approval.
20. **Goals and dates:** the learner can set a goal with a date; the tutor plans the
    pace and reminds them.
21. **Several learners:** separate local profiles on one computer.
22. **Progress:** a progress page with a skills map of what is mastered.
23. **Reminders:** both — opt-in start with the computer in the tray, and reminders
    shown when the app is opened.
24. **Profiles detail deferred:** PIN locks and per-profile keys are decided later.
25. **Labs in live mode:** the tutor can open an SQL or Python lab on the board and
    watch the attempt to help.
26. **Stages:** L1 live tutor core; L2 adaptation and profile; L3 track building and
    sources; L4 voice options and local; L5 extras (images, looks, goals, profiles).

## Alternatives considered

| Alternative | Why it was not chosen |
|---|---|
| Keep the page-plus-chat lesson and add auto read-aloud | does not make the tutor lead or adapt; the owner's core complaint stays |
| Realtime provider voice only | cloud-only, costly, excludes local and most providers |
| Search on every question | slow, costly, and inconsistent; research once per track instead |

## Consequences

**Positive**

- One session loop serves chat, voice and future modes.
- A researched track is reusable offline after the first build.

**Negative / accepted costs**

- Much larger surface: audio capture, VAD, two voice pipelines, search adapters.
- Live sessions spend more tokens than one-off answers.
- Image and page licensing is left to the learner, with clear notice.

## Reversibility

Additive: the current lesson flow keeps working until the lesson-page question is
decided. Modes and providers are behind settings and can be dropped one by one.

## Follow-up

- [x] Owner: lesson page decided (item 5, 2026-10-24).
- [x] Owner: accepted 2026-10-24.
- [ ] claude: split into tasks in `docs/04-tasks.md` once accepted.
