# AGENTS.md

Universal operational guidelines for AI coding agents working in the `xd` repository.

## 1. Project Overview & Tech Stack

`xd` is a general-purpose AI terminal agent built with:

- **Language/Runtime:** TypeScript (Node.js >= 20, pinned via `.nvmrc`)
- **Model Orchestration & Tool Calling:** Vercel AI SDK (`ai`)
- **Terminal User Interface (TUI):** Custom Alternate-Screen TUI Engine with Mode 2026 Synchronized Output and line-differential rendering

> Do not introduce alternative UI frameworks or LLM integration libraries without explicit maintainer approval.

## 2. Source of Truth for APIs & Libraries

- **Vercel AI SDK APIs:** Always consult reference skills in `.agents/skills/` before writing code. Do not hallucinate or rely on outdated pre-training memory for API signatures.
- **Reference Code & Examples:** Consult `references/` for design patterns, conceptual examples, and UI references (see [IMPORTANT.md](IMPORTANT.md)). Do not blindly copy reference code.

## 3. Architecture & Directory Boundaries

All application source code resides in `src/`. Source code maintains strict separation of concerns:

- **Agent Core / Orchestration (`src/engine/`):** Model loops, context management, prompt construction.
- **Tools (`src/tools/`):** Action and tool definitions exposed to the model.
- **TUI (`src/tui/`):** Alternate-screen engine, diff renderer, layout, and overlay components.

## 4. Commands

Execute the following standard npm scripts defined in `package.json`:

- **Build:** `npm run build`
- **Typecheck:** `npm run typecheck`
- **Format:** `npm run format`
- **Test:** `npm test`

## 5. Rules & Boundaries

- **Strict Boundaries:** Never edit, delete, or generate files in `.agents/` or `references/`. These are strictly human-managed (see [IMPORTANT.md](IMPORTANT.md)).
- **No Side-Effect Code:** Do not write feature or runtime code into `src/` during docs or infrastructure passes.
- **Secrets Policy:** Never commit secrets, API keys, credentials, or `.env*` files.
- **Workflow & Style:** Follow Conventional Commits and code formatting guidelines defined in [CONTRIBUTING.md](CONTRIBUTING.md).
- **Ambiguity:** Ask the maintainer for clarification instead of guessing or making unverified architectural assumptions.
