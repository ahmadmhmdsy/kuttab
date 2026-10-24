# 02 — Environment

**Contract**
- **Role:** verified facts about the machine and toolchain.
- **Mutability:** verified facts. Record what is, never what you intend.
- **Read when:** before running anything.
- **Update when:** any machine, toolchain, version, credential location, or
  service change.

**Rule:** every fact here MUST state how it was verified and when. A guessed
version is worse than a missing one, because it is trusted.

---

## How to verify

The commands that re-derive the facts below (run from PowerShell):

    # environment / version sweep
    Get-CimInstance Win32_OperatingSystem, Win32_Processor, Win32_VideoController
    node --version; npm --version; pnpm --version; bun --version; python --version; rustc --version; uv --version; git --version
    # package manager + lockfile: none yet (no code)
    # installed services + ports: none yet
    # free disk
    Get-PSDrive E

## Machine

| Fact | Value | Verified by | Last verified |
|---|---|---|---|
| Operating system | Windows 11 Pro 10.0.26200 | `Get-CimInstance Win32_OperatingSystem` | 2026-10-17T22:00:00+03:00 |
| Architecture | 64-bit (x86_64) | same | 2026-10-17T22:00:00+03:00 |
| CPU / cores | Intel Core i7-10850H, 6 cores / 12 threads | `Get-CimInstance Win32_Processor` | 2026-10-17T22:00:00+03:00 |
| Memory | 47.6 GB | `Win32_OperatingSystem.TotalVisibleMemorySize` | 2026-10-17T22:00:00+03:00 |
| Disk (free / total) | E: 10.2 GB free / ~195 GB | `Get-PSDrive E` | 2026-10-17T22:00:00+03:00 |
| GPU / accelerator | NVIDIA Quadro RTX 3000 (+ Intel UHD) | `Get-CimInstance Win32_VideoController` | 2026-10-17T22:00:00+03:00 |

## Toolchain

| Tool | Version | Verified by | Notes |
|---|---|---|---|
| Node.js runtime | 24.18.0 | `node --version` | |
| npm / pnpm / bun | 11.18.0 / 12.3.4 / 1.3.14 | `--version` each | lockfile kind: none yet (choice pending) |
| Python | 3.13.7 (uv 0.11.22) | `python --version`, `uv --version` | used by the context-pack scripts |
| Rust | rustc 1.98.0 | `rustc --version` | relevant if a Tauri desktop shell is chosen |
| git | 2.47.1.windows.1 | `git --version` | repo initialised 2026-10-17, no commits yet |
| Tauri CLI | 2.12.3 (`@tauri-apps/cli` devDependency of spikes/llm, not global) | `pnpm tauri --version` | builds need VS 2022 C++ build tools (present) and WebView2 |
| Build tool | Vite 8.3.4 + tsc ~6.0 (spikes/llm only) | `pnpm build` | Rust target/ is ~3.5 GB, so set `CARGO_TARGET_DIR` to a C: path because E: is short of space |
| Test runner | unknown — no code yet | | |
| Ollama | not installed | `ollama --version` failed | |

## Services and ports

| Service | Where | Port | Started by |
|---|---|---|---|
| none | | | |

## Credentials

Never record values here. Record only the **name**, the **location**, and the
**scope** required.

| Variable | Required for | Where it lives | Committed? |
|---|---|---|---|
| none yet — product design is BYOK (each end user supplies their own LLM key at runtime) | | | no |

## Network and access

No special network setup. The product's target is local-first: no server of
our own; the only outbound calls are to the user's chosen LLM provider.

## Capabilities and limits

- **Can:** run Node, Python, Rust toolchains locally; NVIDIA GPU available for local models.
- **Cannot:** unknown until the stack is chosen.
- **Workarounds in use:** none.

## Rebuild recipe

unknown — no code yet. Fill when the stack is chosen.

## Known environmental hazards

- E: has only ~10 GB free (2026-10-17). Local model weights and `node_modules`
  can exhaust it; check `Get-PSDrive E` before downloading models.

## Verification log

Append-only.

| Date | What was verified | How | Result |
|---|---|---|---|
| 2026-10-17 | machine + toolchain sweep | commands above | recorded |
| 2026-10-17 | T-3 Tauri spike build | `pnpm tauri build --debug --no-bundle` in spikes/llm | PASS (spikes/llm/evidence/build-debug.log) |
