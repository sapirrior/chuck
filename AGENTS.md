# AGENTS.md

Universal operational guidelines for AI coding agents working in the `xd` repository.

## 1. Project Overview & Tech Stack

`xd` is a general-purpose AI terminal agent built with:

- **Language/Runtime:** TypeScript, executed natively by [Bun](https://bun.sh)
- **Model Orchestration & Tool Calling:** Vercel AI SDK (`ai`)
- **Terminal User Interface (TUI):** Custom Alternate-Screen TUI Engine with Mode 2026 Synchronized Output and line-differential rendering

> Do not introduce alternative UI frameworks or LLM integration libraries without explicit maintainer approval.

## 2. Source of Truth for APIs & Libraries

- **Vercel AI SDK APIs:** Always consult reference skills in `.agents/skills/` before writing code. Do not hallucinate or rely on outdated pre-training memory for API signatures.

## 3. Architecture & Directory Boundaries

All application source code resides in `src/`. Source code maintains strict separation of concerns:

- **Agent Core / Orchestration (`src/engine/`):** Model loops, context management, prompt construction.
- **Tools (`src/tools/`):** Action and tool definitions exposed to the model.
- **TUI (`src/tui/`):** Alternate-screen engine, diff renderer, layout, and overlay components.

## 4. Commands

Standard scripts defined in `package.json`:

| Command | Description |
| :--- | :--- |
| `bun run dev` | Run directly from source in watch mode |
| `bun run start` | Run the CLI directly |
| `bun run build` | Bundle to `./dist/cli.js` (Node-compatible) |
| `bun run compile` | Compile to a standalone binary `./dist/xd` |
| `bun run format` | Check formatting with Prettier |
| `bun run format:fix` | Auto-fix formatting |
| `bun test` | Run tests |

## 5. Rules & Boundaries

- **Strict Boundaries:** Never edit, delete, or generate files in `.agents/`. These are strictly human-managed.
- **No Side-Effect Code:** Do not write feature or runtime code into `src/` during docs or infrastructure passes.
- **Secrets Policy:** Never commit secrets, API keys, credentials, or `.env*` files.
- **Workflow & Style:** Follow Conventional Commits and code formatting guidelines defined in [CONTRIBUTING.md](CONTRIBUTING.md).
- **Ambiguity:** Ask the maintainer for clarification instead of guessing or making unverified architectural assumptions.
