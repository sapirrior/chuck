# Steward TUI Refactor — Execution Plan

Audience: the coder agent implementing this. Read `tui/Rules.txt` first —
this plan exists to get the codebase INTO compliance with those rules; it
does not override them.

## Why this plan is shaped this way

Codebase audit findings (from the current src/tui/, ~4,350 lines):

1. **Layer 0 (engine) is actually solid.** TerminalEngine, DocumentTree,
   FrameBuffer, StateRenderer, ScreenBuffer, cell-layout.ts already do
   real work: sync-mode ANSI output (`\x1b[?2026h/l`), row-level diffing
   against a previous ScreenBuffer, per-history-node layout caching keyed
   by width, viewport/scroll math. This is not the part that needs a
   rewrite. **Do not throw this away.**

2. **The one real engine violation:** `cell-layout.ts`'s
   `wrapVisualLineWithCursor` detects hanging-indent by sniffing the
   string content (`plainText.startsWith(' ● ')`, `'  • '`, `'> '`,
   `'❯ '`, four-space indent, etc). This is a layout primitive making
   content-semantic decisions — the textbook cause of "adding a feature
   means editing the engine." This is fixed in Phase 2.

3. **Inconsistent primitive usage.** `Header`, `StatusBar`, `HelpMenu`,
   `ModelPicker`, `SessionMenu` correctly compose `Box`/`Text`/
   `renderModalBox`. `PromptInput` (603 lines, the highest-traffic
   component) and `StreamingView` bypass primitives entirely, hand-roll
   ANSI strings with raw `chalk`/`figures` calls, and manually recompute
   line counts. This is fixed in Phase 4.

4. **`PromptInput.getLogicalCursor()` hand-computes cursor position with
   magic offsets** (`prefixLen = 2`, `+1` for top border, `+1` if
   `escPending`) that must independently track everything `render()`
   does. This is a live footgun: any future line added to `render()`
   above the input silently desyncs the cursor. Fixed in Phase 4.

5. **Overflow/truncation is a sprawling multi-shape contract.**
   `Component.overflow: 'wrap'|'hidden'|'visible'`,
   `Component.truncation: 'clip'|'ellipsis'|'none'`, `TextNode.wrappable:
   boolean`, `BoxProps.overflow`/`truncation` (slightly different set),
   and `measureNode()` duck-typing across all of them with `'overflow' in
   node` / `'wrappable' in node` fallback chains. Fixed in Phase 3.

6. **Duplicated bullet/hanging-indent formatting** exists independently
   in `message-formatter.ts` (4 functions), `StreamingView.render()`,
   and the engine's own auto-detection. Fixed in Phase 5.

7. **No JSX.** Everything is imperative `Box({...}, [child, child])`
   calls or raw string building. The `Component` base class already
   mirrors React's shape (`props`, `state`, `setState`, `componentDidMount`,
   `componentWillUnmount`) — this was clearly modeled on React without
   adopting it. Addressed in Phase 6, with a deliberately incremental
   recommendation (see "JSX decision" below).

## Research grounding

Looked at how existing declarative terminal renderers solve this exact
problem (Ink, and the React-based renderer Anthropic extracted from
Claude Code's own TUI, published as `ink-terminal`; also blessed/
neo-blessed as the non-declarative alternative). Could not find a
framework literally named "Glyph" in current use — if you had a specific
project in mind, point me at it and I'll fold in a proper comparison.

The common shape across all of them, and the one worth copying:

```
core/     screen buffer, cell/style pools, diff engine, terminal I/O
          (ANSI/CSI/SGR). Zero knowledge of what's being drawn.
layout/   flexbox-like box model + text measurement/wrapping. Pure
          geometry. Zero content semantics — no "this looks like a
          bullet" logic anywhere in here.
react/    (only in the React-based ones) a custom react-reconciler
          host config that drives the layout/core layers.
components/  everything domain-specific — markdown rendering, chat
             bullets, tool-status lines — built by composing layout
             primitives, never by teaching layout about the domain.
```

Steward's current `engine/` + `layout/` already map onto `core/` +
`layout/` above almost exactly, MINUS violation #2. That's good news: the
expensive part (a correct zero-flicker diff renderer) is already built
and correct. The refactor is about restoring the boundary above it, not
rebuilding the renderer.

**JSX decision:** two real options, not the same amount of risk.

- **Option A — full reconciler** (`react` + `react-reconciler` targeting
  a host config that writes into the existing `Component`/`DocumentTree`
  layer, the way Ink and Claude Code's own TUI do it). Gets you real
  reactive diffing, hooks, fine-grained updates. Also the biggest,
  riskiest rewrite on this list — new dependency, new mental model
  (host config, `commitUpdate`, fiber lifecycle), and a full rewrite of
  every component's update path. Doing this while "maintenance eats 90%
  of my time" is how that number goes to 100% for a month.
- **Option B — JSX as sugar** — add a JSX pragma (`jsx`/`jsxs`/`Fragment`)
  that compiles `<Box>`/`<Text>` syntax directly to the SAME
  `Box()`/`Text()` calls that already exist today. No new runtime
  dependency, no reconciler, mechanical/low-risk, works with the engine
  completely unchanged. You get TSX syntax and JSX composition ergonomics;
  you do NOT get automatic reactive re-rendering — components still call
  `setState`/`markDirty` explicitly, same as today.

**Recommendation: do Option B (Phase 6) and stop there unless, after
Phases 1–5 land, the maintenance pain is still there.** Phases 1–5 fix
the actual root causes found in the audit (content-sniffing in the
engine, inconsistent primitive usage, duplicated formatting, cursor
desync risk, enum sprawl). None of those require a reconciler to fix.
Option A is listed as Phase 7 and gated on writing down, in its own doc,
specifically what Option B still leaves unsolved — don't skip straight
to it because it sounds more "correct."

---

## Phase 0 — Safety net before touching anything

**Goal:** a regression net for a zero-flicker renderer, which has no
automated tests today.

- Add a snapshot-test harness that drives `TerminalEngine`/`StateRenderer`
  headlessly (mock `process.stdout.columns/rows`, capture the ANSI bytes
  written instead of a real TTY) and records golden output for these
  states:
  - empty prompt, idle status bar
  - multi-line prompt with cursor mid-text
  - prompt with escPending banner
  - prompt with slash-command palette open
  - prompt with `@file` match list open
  - StreamingView with active tool call + recent output lines
  - StreamingView with streamed assistant markdown (bullets, headers)
  - long history requiring scroll, at 80 and 120 columns
  - a resize event mid-session
  - HelpMenu / ModelPicker / SessionMenu each open
- These are the acceptance test for every phase below. A phase is not
  done until output for unrelated states is byte-identical to its golden
  frame, and output for the states it intentionally changes matches the
  new intended output (reviewed by eye once, then re-recorded as the new
  golden).

**Exit criteria:** harness runs in CI, goldens committed.

---

## Phase 1 — Draw the boundary before changing anything inside it

**Goal:** make the Layer 0/1/2 split from Rules.txt an enforced fact, not
just a document.

- Add a lint rule (dependency-cruiser or ESLint `no-restricted-imports`)
  that forbids `src/tui/components/**` and `src/tui/app.ts` from
  importing `chalk`'s raw styling for width math, `string-width`, or
  `strip-ansi` directly — those may only be imported inside
  `src/tui/primitives/**` and `src/tui/engine/**`. (Color helpers from
  `utils/format.ts` remain fine everywhere — this rule targets *layout*
  math, not color.)
- Add a second rule forbidding `src/tui/primitives/**` and
  `src/tui/engine/**` from importing anything under
  `src/tui/components/**` (one-directional dependency: components depend
  on primitives/engine, never the reverse).
- Land `tui/Rules.txt` in the repo at `src/tui/Rules.txt` (already
  drafted alongside this plan).

**Exit criteria:** lint passes on current code with zero exceptions, or
documented `// eslint-disable` comments on every current violation (there
will be several — that's the exact list Phase 4 needs to clean up).

---

## Phase 2 — Remove content-sniffing from the wrap engine

**Goal:** `cell-layout.ts` no longer inspects string content to decide
indentation.

- In `wrapVisualLineWithCursor`, delete the `plainText.startsWith(' ● ')`
  / `'  • '` / `'* '` / `'- '` / `'> '` / `'❯ '` / `'› '` / `'! '` /
  four-space / three-space / two-space detection block entirely.
- Replace with an explicit parameter: `wrapVisualLineWithCursor(text,
  maxCols, targetCharOffset, hangingIndent = 0)`, where `hangingIndent`
  is a plain number of columns supplied by the CALLER, not inferred.
- Add a Layer 1 primitive, e.g. `primitives/PrefixedLine.ts`, exporting
  something like:
  ```ts
  function prefixedLine(prefix: string, body: string, opts?: { continuationIndent?: number }): TextElement
  ```
  which renders `prefix + body` on the first visual line and pads
  continuation lines by `continuationIndent ?? stringWidth(stripAnsi(prefix))`
  columns — computed from the actual prefix that was passed in, never
  guessed from content.
- Update every call site currently relying on auto-detected indent
  (`message-formatter.ts`'s four format functions, `StreamingView.render()`)
  to go through `prefixedLine` instead of raw string concatenation +
  `wrapVisualLine`. This phase and Phase 5 overlap here — fine to do the
  call-site migration once and get credit for both.

**Exit criteria:** grep for `startsWith(' ' )`-style detection in
`engine/` returns nothing. Phase 0 goldens for bullet/prefix content
still match (indentation behavior should be visually identical — only
*how* it's computed changed).

---

## Phase 3 — Collapse overflow/truncation to booleans

**Goal:** one contract, everywhere, per Rules.txt §4.

- Change `Component.overflow: ComponentOverflow` → `Component.wrap:
  boolean` and `Component.truncation: ComponentTruncation` →
  `Component.clip: boolean` (+ optional `ellipsis?: boolean`, only
  meaningful when `clip` is true).
- Same change to `BoxProps`/`TextProps` (`overflow`/`truncation` props →
  `wrap`/`clip`).
- Update `TextNode`/`UserMessageNode` in `DocumentTree.ts` to implement
  the same two booleans instead of a separate `wrappable: boolean` that
  `measureNode` has to reconcile against `.overflow` with an `'overflow'
  in node` fallback chain.
- Rewrite `measureNode()` in `cell-layout.ts` to read `.wrap`/`.clip`
  directly off a single required interface — delete the `'overflow' in
  node ? ... : 'wrappable' in node ? ... : true` duck-typing chain.
  `ComponentNode` interface gains `wrap: boolean; clip: boolean;
  ellipsis?: boolean` as required fields (not optional, not inferred).
- `overflow: 'visible'` (currently used by `Header`) becomes `wrap: false,
  clip: false` — i.e. "don't wrap, don't cut" — which is exactly what
  `visible` meant; no behavior change, just a name/shape change.
- Sweep every component (`Header`, `StatusBar`, `StreamingView`,
  `PromptInput`, `HelpMenu`, `SelectList`) for the old field names.

**Exit criteria:** `ComponentOverflow`/`ComponentTruncation` types deleted
from the codebase entirely (grep confirms zero references). Phase 0
goldens unchanged.

---

## Phase 4 — Rebuild PromptInput and StreamingView on primitives

**Goal:** the two components that currently bypass Layer 1 stop doing so,
and the cursor-desync footgun is structurally impossible.

- Rewrite `PromptInput.render()` to build its lines via `Box`/`Text`/
  `prefixedLine` (from Phase 2) instead of manual `chalk` string
  concatenation and manual border-drawing.
- Restructure so `render()` produces a single structured intermediate
  value — e.g. `{ lines: string[]; cursor: { lineIndex: number; column:
  number } | null }` — computed in ONE pass. `getLogicalCursor()` becomes
  a thin accessor that reads the `cursor` field of that same structure
  (cached the same way `_getLines` already caches), not a second
  independent line-counting implementation. Delete the magic-number
  offsets (`prefixLen = 2`, manual `+1` for border, `+1` for escPending).
- Do the same restructuring for `StreamingView.render()` — replace the
  hand-rolled bullet/indent logic with `prefixedLine`, and replace the
  raw `.slice(0, 48)` / `.slice(0, 80)` truncation calls with the shared
  `clip`/`ellipsis` primitive behavior from Phase 3 instead of ad-hoc
  slicing.
- Re-run the Phase 1 lint rule on these two files — it should now pass
  with zero disables.

**Exit criteria:** Phase 0 goldens for prompt states (multiline, history
banner, palette open, file-match open) and streaming states (tool call,
markdown) match byte-for-byte. Manual smoke test: type past the wrap
width, confirm cursor tracks correctly; resize mid-input; confirm cursor
still tracks.

---

## Phase 5 — De-duplicate formatting logic

**Goal:** one implementation of "bullet + hanging indent," used
everywhere.

- Confirm `message-formatter.ts`'s `formatSystemMessage`,
  `formatAssistantMessage`, `formatToolStatus`, `formatErrorBadge`, and
  `formatUserMessage` all route through `prefixedLine` (Phase 2) rather
  than each hand-building `` `${bullet} ${text}` `` / `` `  ${text}` ``
  prefixing independently.
- Extract the "blinking/colored status bullet" logic shared between
  `StreamingView`'s active-tool bullet and `message-formatter`'s
  `formatToolStatus` bullet into one helper (status → color) instead of
  two copies of the same completed/failed/running color switch.

**Exit criteria:** grep for the pattern `` `${bullet} ` `` /
`chalk.dim('└ ')` across components/ + utils/ shows a single defining
location, N call sites.

---

## Phase 6 — JSX as sugar (Option B)

**Goal:** components can be written as `.tsx` with `<Box>`/`<Text>`
syntax, with zero new runtime dependencies and zero engine changes.

- Add `src/tui/jsx-runtime.ts` exporting `jsx`, `jsxs`, `Fragment` that
  translate JSX calls directly into the existing `Box()`/`Text()`/
  component-constructor calls. For host tags (`<box>`, `<text>`) map to
  `Box`/`Text`; for capitalized component references (`<Header />`) map
  to `new Header(props)` or equivalent existing construction.
- Set `tsconfig.json`: `"jsx": "react-jsx", "jsxImportSource":
  "./src/tui"` (pointing at the local runtime, not `react`).
- Do NOT add `react` or `react-reconciler` as a dependency in this phase.
- Convert components file-by-file, starting with the ones already
  primitive-clean (`Header`, `StatusBar`, `HelpMenu`, docks) since
  they're the lowest-risk conversions and validate the pragma works
  before touching `PromptInput`/`StreamingView` (freshly rewritten in
  Phase 4 — convert those last, once they've had time to settle).
- Each conversion is mechanical: same primitive calls, JSX syntax
  instead of function-call syntax. If a conversion requires changing
  render *behavior*, that's a sign the component wasn't actually
  primitive-clean yet — finish Phase 4-style cleanup on it first.

**Exit criteria:** all components under `src/tui/components/` are `.tsx`.
Phase 0 goldens unchanged (this phase is a syntax change, not a behavior
change — that's the whole point of Option B).

---

## Phase 7 — Optional: full reconciler (Option A)

**Gate:** do not start this phase without a short written doc listing,
concretely, what's still expensive to maintain after Phase 6. If nothing
is, skip this phase — Option B was sufficient and Option A's cost isn't
justified.

If gated in:
- Introduce `react` + `react-reconciler`, with a host config whose
  `commitUpdate`/`createInstance`/etc. write into the EXISTING
  `Component`/`DocumentTree`/`TerminalEngine` layer — reuse Layer 0 and
  the Phase 2–5 cleaned-up Layer 1 as the paint backend, don't rewrite
  them.
- Migrate components incrementally behind the reconciler, component by
  component, keeping the Phase 6 JSX call sites working throughout (the
  JSX syntax doesn't have to change between Option B and Option A — only
  what the pragma compiles to changes).
- This phase gets its own plan once gated in; sizing it now would be
  guessing.

---

## Phase 8 — Final regression pass

- Full Phase 0 golden-frame suite, all states, at 80/100/120/160 columns.
- Manual checklist: resize while streaming, resize while modal open,
  Ctrl+C double-tap timing, scroll during active generation, CJK/emoji
  width handling in a tool-result line, ANSI passthrough from raw tool
  output (e.g. a tool that returns pre-colored terminal output) still
  renders without engine changes.
- Re-run Phase 1 lint rules with zero disables across the entire
  `src/tui/` tree.
- Rules.txt compliance check: every PR merged during this plan should be
  re-readable against Rules.txt §1–9 with no violations left in place.

---

## Notes for whoever picks this up

- Phases 1–5 are the ones that actually fix "adding a feature = editing
  the engine." Do not skip to Phase 6/7 for the JSX appeal and leave
  those undone — JSX syntax over a still-sprawling contract just makes
  the sprawl prettier to look at.
- Every phase after Phase 0 should be its own PR, reviewed against the
  Phase 0 goldens before merge.

