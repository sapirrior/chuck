# xd — Quality of Life & Clean Architecture Plan

**Audience:** an AI coding agent (Claude Code / xd itself) executing this plan inside the `xd` repo.
**Ground rule inherited from `AGENTS.md` / `IMPORTANT.md`:** never touch `.agents/` or `references/`. Follow Conventional Commits. Run `npm run typecheck` after every phase. **Verify every claim below against the live file before editing it — line numbers and content may have drifted since this plan was written.**

This plan is ordered by dependency, not by importance: fix the small visible bug first (cheap, isolated), then the rendering engine (self-contained), then the registration/architecture patterns (touches the most files, do last so earlier fixes aren't caught in a big refactor diff).

---

## Phase 0 — Read before touching anything

Read these files in full before starting any phase. Do not skim.

1. `src/ui/components/header.tsx`
2. `src/ui/utils/markdown.ts`
3. `src/ui/components/markdown.tsx`
4. `src/ui/theme/colors.ts`, `src/ui/theme/figures.ts`, `src/ui/theme/index.ts`
5. `src/tools/catalog.ts`, `src/tools/index.ts`, `src/tools/types.ts`, and one file under `src/tools/list/` (e.g. `read-file.ts`) to see the current per-tool shape
6. `src/commands/registry.ts`, `src/commands/index.ts`, and one command file (e.g. `clear.ts`)
7. `src/ui/components/tool-status.tsx`
8. `src/ui/hooks/use-agent-runner.ts`
9. `src/ui/app.tsx`
10. `IMPORTANT.md` — this contains the maintainer's **already-decided target architecture** (`src/engine/`, `src/tools/<name>/`, `src/commands/<name>/`, `src/components/`, `src/context/`, `src/state/`, `src/hooks/`, `src/utils/`). Every structural recommendation below exists to close the gap between the current tree and this document, not to invent a new one — do not propose a different target shape.

Confirm each finding below still matches what you read before editing. If a file has changed since this plan was written, re-derive the fix from the principle stated, not from the line numbers.

---

## Phase 1 — Header logo/text alignment (the reported bug)

**File:** `src/ui/components/header.tsx`

**Verified problem:** the three logo rows use inconsistent widths and no shared gutter column between the logo glyphs and the text beside them:

```tsx
<Text color={theme.brand}> ▛███▜ </Text>          {/* row 1: 7 visible chars incl. leading space */}
<Text bold color={theme.brand}>xd</Text>
...
<Text color={theme.brand}>▀█████▀ </Text>          {/* row 2: 8 visible chars, no leading space */}
...
<Text color={theme.brand}> ▘▘ ▝▝ </Text>            {/* row 3: 7 visible chars incl. leading space */}
```

Row 1 has a leading space, row 2 doesn't — that's the actual misalignment (the logo's left edge shifts by one column between rows), and there's no single consistent "logo column width" constant driving all three, so any future glyph edit will silently re-break alignment.

**Fix:**
1. Extract the three logo rows into a single `LOGO_LINES: string[]` constant (or a small `logo.ts` under `src/ui/theme/` alongside `figures.ts`, since it's presentation data like the glyphs) with each line pre-padded to the **same visible width** using `string-width` (already a dependency, used in `markdown.ts`) — not raw `.length`, since these are Unicode block glyphs.
2. Render the logo as its own fixed-width `<Box width={N}>` column, and put the title/version/hint text in a sibling `<Box flexDirection="column">` to the right — this guarantees a single consistent gap regardless of glyph width changes, instead of hand-placing a trailing space per row.
3. Use `theme.brand` / `theme.permission` as already done — no color logic changes needed here.

```tsx
<Box flexDirection="row">
  <Box flexDirection="column" width={LOGO_WIDTH} marginRight={1}>
    {LOGO_LINES.map((line, i) => (
      <Text key={i} color={theme.brand}>{line}</Text>
    ))}
  </Box>
  <Box flexDirection="column">
    <Box><Text bold color={theme.brand}>xd</Text><Text color={theme.permission}> v{version}</Text></Box>
    <Box><Text dimColor>Type </Text><Text color={theme.brand}>/</Text><Text dimColor> for commands</Text></Box>
  </Box>
</Box>
```

4. Verify in a real terminal (or via a quick Ink `render()` smoke script) that all three rows now share one left edge and one consistent gap column before moving on.

---

## Phase 2 — Markdown rendering: correctness + consistency

**Files:** `src/ui/utils/markdown.ts`, `src/ui/components/markdown.tsx`, `src/ui/theme/colors.ts`

### 2.1 Duplicate color source of truth (verified)

`markdown.ts` defines its own hex constants at the top of the file:

```ts
const BRAND_HEX = '#D77757';
const PERMISSION_HEX = '#B1B9F9';
const INFO_HEX = '#7BA5DA';
const DIM_BAR_HEX = '#505050';
const RULE_HEX = '#333333';
```

These are near-duplicates of `theme.brand`, `theme.permission`, `theme.info`, `theme.subtle`, `theme.dashedRule` in `src/ui/theme/colors.ts` — but hand-copied as separate literals, not imported. Two sources of truth for the same palette means the palette can drift silently (e.g. someone tweaks `theme.brand` for a theme change and the markdown renderer keeps the old color).

**Fix:** delete the local `*_HEX` constants in `markdown.ts` and import `getTheme()` from `../theme/index.js` instead, mapping:
- `BRAND_HEX` → `theme.brand`
- `PERMISSION_HEX` → `theme.permission`
- `INFO_HEX` → `theme.info`
- `DIM_BAR_HEX` → `theme.subtle`
- `RULE_HEX` → `theme.dashedRule`

This also means `applyMarkdown` starts respecting a future theme switch, which it currently cannot (see 4.3).

### 2.2 Hardcoded bullet glyph bypasses the figures registry (verified)

`markdown.tsx` line 35: `<Text color="white">● </Text>` — hardcodes both the glyph and the color instead of using `figures.blackCircle` (already defined in `theme/figures.ts` and already used correctly in `tool-status.tsx`) and a theme color. Also `color="white"` is a raw CSS-ish literal, not a theme token — every other component in the codebase goes through `theme.*`.

**Fix:** import `figures` and `getTheme` in `markdown.tsx`; replace the literal with `{figures.blackCircle} ` and the color with a real theme field (`theme.text` looks like the correct semantic match — verify against how `tool-status.tsx` uses `theme.text` for its equivalent bullet-line text).

### 2.3 Nested lists inside list items are not handled (verified via marked.js semantics)

In `formatToken`'s `'list_item'` case, the inner tokens are mapped with a flat `listDepth + 1`, but `marked` can hand back a `list_item` whose `tokens` contain a nested `list` token as a sibling of a `text`/`paragraph` token (this is standard marked behavior for CommonMark-compliant nested lists, confirmed against current marked.js token semantics). The current code doesn't special-case this — it just recurses `formatToken` on whatever's there, which happens to work for the `list` case itself but produces broken indentation because `list_item`'s own EOL-joining logic (`.trim()` on the whole inner string) collapses the nested list's line breaks into the parent line.

**Fix:** in the `'list_item'` case, don't blanket `.trim()` the joined inner content. Instead, render leading inline content (text/em/strong/codespan) trimmed, but any nested `list`/`blockquote`/`code` token content preserved with its own line breaks and re-indented by `listDepth`. Write a focused test (see Phase 2.5) with a two-level nested list to confirm output before moving on.

### 2.4 Code blocks have no visual gutter (verified — QoL parity gap vs. Claude Code)

The `'code'` case just returns `highlighted + EOL + EOL` with no left padding/border, while `blockquote` gets a `│` bar and `table` gets a full box. Given the stated goal is "1:1 Claude Code Markdown Renderer" (the file's own doc comment), fenced code blocks in Claude Code's terminal renderer get a subtle left gutter/indent to visually separate them from prose. Add a 2-space left-indent per line (matching the `list_item` indent convention) using the same `theme.subtle` color for a thin left rule, consistent with the blockquote bar treatment.

### 2.5 No verification harness for the renderer

There is currently no test file for `markdown.ts` anywhere in the tree (confirmed: no `*.test.ts`/`*.spec.ts` exists in `src/ui/utils/`). Before editing further, add a minimal script (doesn't need to be a full test framework if `package.json` has none configured — check `package.json`'s `test` script first) that runs `applyMarkdown` against: a heading, a loose list with a nested list, a table, a code fence, a blockquote, and inline `**bold**`/`*em*`/`` `code` ``. Compare output before/after each fix in this phase to prevent regressions. If `package.json` already names a test runner, write real test files instead of an ad-hoc script.

### 2.6 `markdown.tsx`/`markdown.ts` missing from the `src/ui/index.ts` barrel (verified)

`src/ui/index.ts` exports every other component and util (`diff.ts`, `file-search.ts`, all `docks/*`) but not `components/markdown.js` or `utils/markdown.js`. This is either dead oversight or intentional — verify by grepping for direct relative imports of `markdown.js` elsewhere in `src/` before deciding. If nothing imports it directly and it's meant to be public, add it to the barrel for consistency with every other component.

---

## Phase 3 — Tool registration: remove the 3-touch-point pattern

**Files:** `src/tools/index.ts`, `src/tools/catalog.ts`, `src/tools/list/*.ts`, `src/ui/components/tool-status.tsx`

**Verified problem:** adding a new tool today requires editing `src/tools/index.ts` in three separate places (import, `.register()` call, `export *`) *and* editing the unrelated `formatToolDisplayName` switch statement in `src/ui/components/tool-status.tsx` to give it a display name — four touch points for one new capability, across two unrelated layers (tools vs. UI). This is exactly the "flexibility/maintainability" gap described in the request, and it also violates `IMPORTANT.md`'s own stated target (`src/tools/<tool-name>/` self-contained modules including their UI preview piece).

This phase is the highest-effort one — do it last, in its own commit(s), and don't mix it with Phase 1/2 changes.

### 3.1 Give each tool ownership of its own display metadata

Add two optional fields to `ToolDefinition` in `src/tools/types.ts`:

```ts
displayName: string; // already exists — reuse it, don't duplicate
icon?: string;        // optional glyph override, defaults to figures.blackCircle
```

`displayName` **already exists** on `ToolDefinition` (verified in `types.ts`) but `tool-status.tsx` doesn't use it — it re-derives a display name from a hardcoded switch on the *raw tool name* instead. That's the actual bug: the data already exists on each tool definition and is simply not being read.

**Fix:** change `ToolStatus` to accept the tool's own `displayName` (passed down from wherever the tool-call event is turned into props — trace this through `use-agent-runner.ts` and `message-history.tsx`) instead of re-deriving it from `toolName` via the switch. Delete `formatToolDisplayName` once nothing calls it. Verify each of the 9 existing tools in `src/tools/list/` already sets a sensible `displayName` (`'Bash'`, `'Write'`, etc.) matching what the switch currently produces — if any don't, fix the tool definition, not the UI.

### 3.2 Auto-discovery for tool registration (removes 3 of the 4 touch points)

Rather than hand-importing every tool file in `src/tools/index.ts`, move to directory-based auto-registration:
1. Restructure `src/tools/list/*.ts` into `src/tools/<tool-name>/index.ts` (one folder per tool) — this also directly satisfies the `IMPORTANT.md` target structure (`src/tools/<tool-name>/`, encapsulating schema + handler + confirmation rules).
2. In `src/tools/index.ts`, replace the explicit import list with either:
   - a small build-time codegen step that globs `src/tools/*/index.ts` and emits the registration list (if the project wants zero runtime FS cost), or
   - a runtime `import.meta.glob`-style dynamic import if the bundler/runtime supports it — **verify Node's ESM + the project's `tsconfig.json` (`NodeNext`) support this before committing to it**; if not, codegen is the safer choice.
3. Keep `defaultToolCatalog.register(...)` as the underlying mechanism — only the *enumeration* of which modules to import becomes automatic. Don't change `ToolCatalog`'s public API; it's already clean (verified — single responsibility, no changes needed).

### 3.3 Apply the identical pattern to `src/commands/`

**Verified problem:** same shape of issue — `src/commands/registry.ts` hand-imports and registers every command (`clearCommand`, `exitCommand`, `modelCommand`, `resumeCommand`), and `src/commands/index.ts` hand-exports every file.

**Fix:** mirror 3.2 — restructure `src/commands/*.ts` into `src/commands/<command-name>/index.ts` per `IMPORTANT.md`'s target, and apply the same auto-discovery registration approach so `defaultCommandRegistry` doesn't need manual edits per new command. `CommandRegistry` itself (in `registry.ts`) is otherwise clean and needs no API changes.

### 3.4 Do not touch `agent-runner.ts` in this phase

`src/agent/agent-runner.ts` was reviewed and is well-structured (single responsibility, clear event-driven shape). The one minor note — `tools?: Record<string, any>` losing type safety — is optional/low-priority polish, not required for this plan; skip unless time remains after 3.1–3.3 and typecheck is green.

---

## Phase 4 — Structural alignment with `IMPORTANT.md`'s target architecture

This phase is the largest and riskiest — it's a directory reorganization. Do it only after Phases 1–3 are complete, typechecked, and committed separately, so a bad rename doesn't tangle with a content fix in the same diff.

**Verified gap:** `IMPORTANT.md` already specifies the target layout (`src/engine/`, `src/tools/<name>/`, `src/commands/<name>/`, `src/components/`, `src/context/`, `src/state/`, `src/hooks/`, `src/utils/`). The current tree instead has `src/agent/`, `src/ui/components/`, `src/ui/hooks/`, `src/ui/utils/`, `src/ui/theme/`, and no `src/state/` or `src/context/` at all — state currently lives inside one large hook, `use-agent-runner.ts`, which `app.tsx` destructures 20 fields from.

### 4.1 `src/agent/` → `src/engine/`
Rename per `IMPORTANT.md`. Update all relative imports (`agent/index.js` → `engine/index.js`) across `src/`. Do this as a pure rename commit — no logic changes — so it's trivially reviewable.

### 4.2 Extract `src/state/`
`use-agent-runner.ts` currently owns session state, streaming state, dock-visibility state (`showHelp`, `showResume`, `showModelPicker`), and confirmation state all in one hook, which `app.tsx` consumes as a 20-field destructure. Per `IMPORTANT.md`'s "Central typed state machine and store," split this into:
- `src/state/` — the actual state shape/store (session, streaming, usage)
- keep a thinner `src/ui/hooks/use-agent-runner.ts` (or move to `src/hooks/` per the target) that wires the state store to Ink's render cycle

Verify `use-agent-runner.ts`'s full contents first — this plan should not guess at its internal shape from the outside; read it fully before deciding the split boundary.

### 4.3 Enable actual light/dark theme switching
`getTheme()` in `colors.ts` currently always returns `darkTheme` — `lightTheme` is fully defined but dead code (verified: `getTheme()` has no branching). If this is intentional (feature not yet wired to a setting), leave a `// TODO` note rather than "fixing" it silently — this could be an intentional future flag tied to `src/config/settings.ts` (check `settings.ts` for any theme-related field before assuming it's simply unimplemented).

### 4.4 `src/ui/components/` → `src/components/`
Per `IMPORTANT.md`. Straightforward rename, same caution as 4.1: separate commit, imports-only diff.

---

## Execution notes for the agent running this plan

- After each phase: run `npm run typecheck` and `npm run format` (both are defined in `package.json` per `AGENTS.md`). Do not proceed to the next phase on a red typecheck.
- Commit each phase (or sub-phase, for Phase 4) separately using Conventional Commits, e.g. `fix(ui): align header logo and title columns`, `refactor(tools): auto-discover tool registration`.
- Where this plan says "verify" — actually re-read the file first. Several findings above cite exact current line content; if the file has drifted, re-derive the fix from the stated principle, don't blindly pattern-match old line numbers.
- Do not touch `.agents/` or `references/` at any point (per `IMPORTANT.md` — non-negotiable).
- If `references/claude-code.wit.xml` or `references/delta.wit.xml` are available in this environment, consult them (via the `wit` CLI per `IMPORTANT.md`'s inspection protocol — never dump them raw) for the code-fence gutter styling (2.4) and any prior art on light/dark theme wiring (4.3) before inventing new conventions from scratch.

