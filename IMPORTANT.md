# IMPORTANT.md — Manifest of Manual & Temporary Assets

## Purpose

This document tracks directories and assets in `xd` that are supplied manually by the project owner or human maintainers. These resources must **never** be automatically generated, overwritten, refactored, or "completed" by any AI coding agent. Agents may inspect or read these files as references when available, but must not modify them.

---

## 1. `.agents/` Directory (Human-Managed)

- **Contents:** Reference and behavioral skills provided directly by the human maintainer under `.agents/skills/`, specifically:
  - Skill for the **Vercel AI SDK**
  - Skill for **Ink** (terminal UI library)
- **Role:** These skills instruct AI coding agents on correct, idiomatic, and up-to-date API usage for both libraries within this repository. They are developer/agent guidance assets, not application code.
- **Rules for Agents:**
  - Never write, edit, delete, or attempt to "improve" files inside `.agents/`.
  - Only read skills to inform implementation decisions.

---

## 2. `references/` Directory (Human-Managed)

The `references/` directory contains external reference archives and codebases provided to guide design, architecture, and examples. It is human-managed and read-only.

- **Inspection Protocol (`wit` CLI):**
  - References stored as `.wit.xml` snapshot archives must **never** be dumped raw into the agent context.
  - Inspect snapshot contents specifically via the `wit` CLI tool (e.g., `wit list references/<file>.wit.xml`, `wit glance references/<file>.wit.xml <path|identity>`, `wit meta <file>.wit.xml`).

- **Reference Assets:**
  - **`references/delta.wit.xml`:**
    - Provides architectural and conceptual context on what constitutes a _General-Purpose Agent_ (note: this codebase is incomplete and contains known bugs/rough edges; learn from its concepts, do not copy broken patterns).
    - Also serves as reference data for theme colors and palette structure.
  - **`references/claude-code.wit.xml`:**
    - Reference for code logic examples, terminal UI/UX implementation patterns, and overall architecture.
    - **Adopted File Structure & Organization Strategy:** `xd` adopts the modular architectural blueprint of Claude Code adapted cleanly for modern TypeScript, Ink, and the Vercel AI SDK:
      - `src/engine/` (Agent Core): Model turn loop, streaming orchestration, and context compilation.
      - `src/tools/`: Self-contained tool modules (`src/tools/<tool-name>/`), each encapsulating its parameter schema (Zod), execution handler, safety/confirmation rules, and UI preview component.
      - `src/commands/`: Modular slash command system (`src/commands/<command-name>/`) for terminal commands like `/model`, `/clear`, `/help`.
      - `src/tui/`: High-performance, zero-flicker Alternate-Screen TUI Engine (`StateRenderer`, `TerminalEngine`, `DocumentTree`, `PromptInput`, `StatusBar`, dock overlays).
      - `src/context/`: Workspace boundary discovery, system prompt compilation, and environment context.
      - `src/utils/`: Shell execution, token counters, and ANSI styling.
    - **Model-Agnostic Adaptation:** While Claude Code is locked to Anthropic's proprietary SDK, `xd` is fully model-agnostic via the Vercel AI SDK (`@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`) and excludes enterprise overhead (telemetry, remote SSH bridges, internal proxies) to remain lean and fast.

- **Strict Rules for Agents:**
  - `references/` is strictly for reading examples and inspiration.
  - Never generate, overwrite, or edit files in `references/`.

---

## 3. Pending Decisions & Running Manifest

- **License Choice:** Pending human decision. No `LICENSE` file has been generated yet.
- **Dependency Major Versions:** Exact major versions for `ai` (Vercel AI SDK) and `ink` are awaiting confirmation before pinning in `package.json`.
- **Test Framework:** TBD prior to the first feature PR.
