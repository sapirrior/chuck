# AGENTS.md

Universal operational guidelines for AI coding agents working in the `xd` repository.

## 1. Project Overview & Tech Stack
`xd` is a general-purpose AI terminal agent built with:
- **Language/Runtime:** TypeScript (Node.js >= 20, pinned via `.nvmrc`)
- **Model Orchestration & Tool Calling:** Vercel AI SDK (`ai`)
- **Terminal User Interface (TUI):** Ink (`ink`, React-based)

> Do not introduce alternative UI frameworks or LLM integration libraries without explicit maintainer approval.

## 2. Source of Truth for APIs & Libraries
- **Vercel AI SDK & Ink APIs:** Always consult reference skills in `.agents/skills/` before writing code. Do not hallucinate or rely on outdated pre-training memory for API signatures.
- **Reference Code & Examples:** Consult `references/` for design patterns, conceptual examples, and UI references (see [IMPORTANT.md](file:///data/data/com.termux/files/home/works/xd/IMPORTANT.md)). Do not blindly copy reference code.

## 3. Architecture & Directory Boundaries (Future Guidance)
All application source code will reside in `src/`. Future code must maintain strict separation of concerns:
- **Agent Core / Orchestration:** Model loops, context management, prompt construction.
- **Tools:** Action and tool definitions exposed to the model.
- **UI Components:** Ink-based rendering components and hooks.

*Note: Do not create feature directories until implementation tasks begin.*

## 4. Commands
Execute the following standard npm scripts defined in `package.json`:
- **Build:** `npm run build`
- **Typecheck:** `npm run typecheck`
- **Lint:** `npm run lint`
- **Format:** `npm run format`
- **Test:** `npm test`

## 5. Rules & Boundaries
- **Strict Boundaries:** Never edit, delete, or generate files in `.agents/` or `references/`. These are strictly human-managed (see [IMPORTANT.md](file:///data/data/com.termux/files/home/works/xd/IMPORTANT.md)).
- **No Side-Effect Code:** Do not write feature or runtime code into `src/` during docs or infrastructure passes.
- **Secrets Policy:** Never commit secrets, API keys, credentials, or `.env*` files.
- **Workflow & Style:** Follow Conventional Commits and code formatting guidelines defined in [CONTRIBUTING.md](file:///data/data/com.termux/files/home/works/xd/CONTRIBUTING.md).
- **Ambiguity:** Ask the maintainer for clarification instead of guessing or making unverified architectural assumptions.
