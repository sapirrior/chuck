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
    - Provides architectural and conceptual context on what constitutes a *General-Purpose Agent* (note: this codebase is incomplete and contains known bugs/rough edges; learn from its concepts, do not copy broken patterns).
    - Also serves as reference data for theme colors and palette structure.
  - **`references/claude-code.wit.xml`:**
    - Reference for code logic examples and full terminal UI/UX implementation patterns.
    - `xd` aims to be a comparable terminal agent equivalent to Claude Code, but engineered cleanly with TypeScript, Vercel AI SDK, and Ink—use it for inspiration and logic patterns, never blindly clone it.

- **Strict Rules for Agents:**
  - `references/` is strictly for reading examples and inspiration.
  - Never generate, overwrite, or edit files in `references/`.

---

## 3. Pending Decisions & Running Manifest
- **License Choice:** Pending human decision. No `LICENSE` file has been generated yet.
- **Dependency Major Versions:** Exact major versions for `ai` (Vercel AI SDK) and `ink` are awaiting confirmation before pinning in `package.json`.
- **Test Framework:** TBD prior to the first feature PR.
