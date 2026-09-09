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
- **Expected Asset:** `references/delta.wit.xml` (source artifact is named `delta_wit.xml`; human maintainer to confirm final placement and filename naming convention).
- **Role:** Pure styling and theming reference data containing terminal UI color codes, theme tokens, and palette structures.
- **Strict Logic/Styling Separation Rule:**
  - `delta.wit.xml` informs **how things look**, never **how things work**.
  - No logic, application behavior, control flow, tool execution, or architectural structure may ever be derived from `delta.wit.xml`.
- **Rules for Agents:**
  - Read-only reference for theme/color definitions in Ink components.
  - Never generate or modify files inside `references/`.

---

## 3. Pending Decisions & Running Manifest
- **License Choice:** Pending human decision. No `LICENSE` file has been generated yet.
- **Dependency Major Versions:** Exact major versions for `ai` (Vercel AI SDK) and `ink` are awaiting confirmation before pinning in `package.json`.
- **Test Framework:** TBD prior to the first feature PR.
