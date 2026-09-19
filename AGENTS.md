# AGENTS.md

Universal operational guidelines for AI coding agents working in the `steward` repository.

## 1. Project Overview & Tech Stack

`steward` is an interactive AI engineering assistant for the terminal — built with:

- **Language/Runtime:** TypeScript, executed natively by [Bun](https://bun.sh)
- **Model Orchestration & Tool Calling:** Vercel AI SDK (`ai` v7)
- **Terminal User Interface (TUI):** Custom Alternate-Screen TUI Engine with Mode 2026 Synchronized Output and line-differential rendering

> Do not introduce alternative UI frameworks or LLM integration libraries without explicit maintainer approval.

## 2. Source of Truth for APIs & Libraries

- **Vercel AI SDK APIs:** Always consult reference skills in `.agents/skills/` before writing code. Do not hallucinate or rely on outdated pre-training memory for API signatures.

## 3. Architecture & Directory Boundaries

All application source code resides in `src/`. Source code maintains strict separation of concerns:

- **Agent Core / Orchestration (`src/engine/`):** Model loops, context management, system prompt construction.
- **Services (`src/services/`):** Infrastructure subsystems (Background Shell Tasks, Pre-mutation Checkpoint manager, Session Todos store, Read-only Update Checker).
- **Tools (`src/tools/`):** Action and tool definitions exposed to the model (`read_file`, `write_file`, `edit_file`, `glob`, `grep`, `list_dir`, `sleep`, `bash`, `task_read`, `task_send_input`, `task_kill`, `web_fetch`, `web_search`, `TodoWrite`, `TodoUpdate`, `TodoRead`, `SkillList`, `SkillRead`).
- **Skills (`src/skills/`):** On-demand skill discovery (`.agents/skills/`, `~/.agents/skills/`, `~/.steward/skills/`) and safe resource loading.
- **Session (`src/session/`):** Canonical session schema v1 storing ordered `ModelMessage[]`. Derived UI projections are computed at runtime. Session todos are stored separately under `~/.steward/todos/<sessionId>/todos.json`.
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
- **Permission & Checkpoint Protection:** Workspace mutations and bash commands are gated by user permission and automated rewind checkpoints.
- **Session-Scoped Todos:** Operational todo state is persisted outside the repository at `~/.steward/todos/<sessionId>/todos.json`.
- **Secrets Policy:** Never commit secrets, API keys, credentials, or `.env*` files.
- **Workflow & Style:** Follow Conventional Commits and code formatting guidelines defined in [CONTRIBUTING.md](CONTRIBUTING.md).
- **Ambiguity:** Ask the maintainer for clarification instead of guessing or making unverified architectural assumptions.
