# AGENTS.md

Universal operational guidelines for AI coding agents working in the `steward` repository.

## 1. Project Overview & Tech Stack

`steward` is an interactive AI engineering assistant for the terminal — built with:

- **Language/Runtime:** TypeScript, executed natively by [Bun](https://bun.sh)
- **Model Orchestration & Tool Calling:** Vercel AI SDK (`ai`)
- **Terminal User Interface (TUI):** Custom Alternate-Screen TUI Engine with Mode 2026 Synchronized Output and line-differential rendering

> Do not introduce alternative UI frameworks or LLM integration libraries without explicit maintainer approval.

## 2. Source of Truth for APIs & Libraries

- **Vercel AI SDK APIs:** Always consult reference skills in `.agents/skills/` before writing code. Do not hallucinate or rely on outdated pre-training memory for API signatures.

## 3. Architecture & Directory Boundaries

All application source code resides in `src/`. Source code maintains strict separation of concerns:

- **Agent Core / Orchestration (`src/engine/`):** Model loops, context management, prompt construction.
- **Tools (`src/tools/`):** Action and tool definitions exposed to the model (`write_artifact`, `edit_artifact`, `write_plan`, `read_file`, `find_files`, `search_text`, `list_dir`, `web_fetch`, `web_search`). Artifacts and plans are strictly confined to `.steward/`.
- **Session (`src/session/`):** Canonical session schema v1 storing ordered `ModelMessage[]`. Derived UI projections are computed at runtime.
- **TUI (`src/tui/`):** Alternate-screen engine, diff-free minimal rendering, layout, and overlay components. Strictly follows the 3-layer architecture and frozen engine contract defined in [`src/tui/Rules.txt`](src/tui/Rules.txt). Components are written in declarative JSX (`.tsx`).

## 4. Commands

Standard scripts defined in `package.json`:

| Command | Description |
| :--- | :--- |
| `bun run dev` | Run directly from source in watch mode |
| `bun run start` | Run the CLI directly |
| `bun run build` | Bundle to `./dist/cli.js` (Node-compatible) |
| `bun run compile` | Compile to a standalone binary `./dist/steward` |
| `bun run format` | Check formatting with Prettier |
| `bun run format:fix` | Auto-fix formatting |
| `bun run lint:boundaries` | Check TUI 3-layer architecture boundary rules |
| `bun test` | Run tests (including headless golden snapshot suite) |

## 5. Rules & Boundaries

- **Strict Boundaries:** Never edit, delete, or generate files in `.agents/`. These are strictly human-managed.
- **No Side-Effect Code:** Do not write feature or runtime code into `src/` during docs or infrastructure passes.
- **Non-Destructive Philosophy:** Host workspace files are not directly edited by artifact tools; all artifact writes/edits are confined to `.steward/`.
- **Secrets Policy:** Never commit secrets, API keys, credentials, or `.env*` files.
- **Workflow & Style:** Follow Conventional Commits and code formatting guidelines defined in [CONTRIBUTING.md](CONTRIBUTING.md).
- **Ambiguity:** Ask the maintainer for clarification instead of guessing or making unverified architectural assumptions.
