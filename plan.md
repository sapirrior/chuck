# xd TUI — Layout Engine & Reconciler Overhaul

Target repo: `xd` (bun/TypeScript terminal agent). This plan is written for an
AI coding agent to execute autonomously, file by file. Every claim about the
current bug is backed by an exact file/line reference from the uploaded
codebase (`xd_wit.xml`). Every terminal/ANSI fact is verified against
primary sources (linked). Do not skip Phase 0 — it is the actual fix for the
`/skills` bug and ships independently of the bigger rebuild.

---

## 0. Root cause analysis (verified against the actual source)

### Bug A — `/skills` (and any multi-line command result) corrupts the frame

Call chain:

1. `src/commands/skills/index.ts` builds a multi-line report and joins it
   with **literal `\n`** into a single string:
   ```ts
   return { handled: true, message: lines.join('\n') };
   ```
2. `src/tui/app.ts` (`handleSubmit`, slash-command branch) does:
   ```ts
   this.engine.commit('system', formatSystemMessage(cmdResult.message));
   ```
3. `src/tui/utils/message-formatter.ts` → `formatSystemMessage()`:
   ```ts
   export function formatSystemMessage(content: string): string[] {
     const infoColor = themeColor(theme.permission);
     return [`${infoColor(`${figures.info} ${content}`)}`];
   }
   ```
   This returns an **array of exactly one string**, and that one string
   still contains the raw `\n` bytes from step 1. It never splits on `\n`.
4. `TerminalEngine.commit()` → `DocumentTree.addText(lines, isWrappable=true)`
   wraps that single (multi-line!) string in a `TextNode`.
5. `TextNode.getLines()` (`src/tui/engine/DocumentTree.ts`) calls
   `wrapVisualLine(line, width)` from `src/tui/engine/cell-layout.ts` on it.
   **`wrapVisualLine`/`tokenizeAnsi` has no case for `\n` or `\r`.** It
   iterates the string with `for (const char of plainSegment)`, and a
   `\n` character is not `' '` or `'\t'`, so it is folded into a "word"
   chunk like any other printable character (its display width from
   `string-width` is 0, so it never triggers a wrap — it just rides along
   inside whatever chunk it landed in).
6. The result: one entry of `TextNode.getLines()` — which the entire
   engine treats as **exactly one physical terminal row** — actually
   contains a raw, un-escaped newline byte in the middle of it.
7. `StateRenderer.render()` (`src/tui/engine/StateRenderer.ts`) writes each
   row with `\x1b[${i+1};1H\x1b[2K${next}` — i.e. it moves the cursor to
   row `i+1`, clears it, and writes `next`. If `next` itself contains a
   `\n`, the terminal performs its own linefeed *in the middle of that
   write*, silently consuming one extra on-screen row that the renderer's
   row-index math (`FrameBuffer.ts` → `computeDocumentFrame`) never
   accounted for.

This breaks the one invariant the whole renderer depends on:
**1 array entry === 1 terminal row**. Once it's violated, every row index
computed after that point (including the mounted `PromptInput`'s cursor
position, which is placed by absolute row/column via
`\x1b[${line+1};${column}H` in `StateRenderer`) is off — which is exactly
the "breaks the input box" symptom. It "recovers" on resume/prompt-submit
only because those code paths call `engine.clearAll()` /
`requestFrame(true)`, which does a **full clear + repaint** (`\x1b[H\x1b[J`)
and rebuilds `previousLines` from scratch — that resets the diff baseline,
it does not fix the underlying corrupted row.

**This is a two-line-of-blame bug**, but it exposes a structural gap: the
layout layer trusts every string handed to it to already be a single
visual row, and nothing enforces that.

### Bug B — fixed single-line components overflow and trigger terminal auto-wrap

`src/tui/components/StatusBar.ts`:
```ts
const leftWidth = stringWidth(stripAnsi(left));
const rightWidth = stringWidth(stripAnsi(right));
const spaceCount = Math.max(1, termWidth - 1 - leftWidth - rightWidth);
const line = `${left}${' '.repeat(spaceCount)}${right}`;
```
When `leftWidth + rightWidth + 1 > termWidth - 1` (narrow terminal, long
model id, or a large token count string), `spaceCount` clamps to `1`
instead of shrinking `right` — so `line`'s true display width **exceeds**
`termWidth`. The same shape of bug (`Math.max(1, ...)` padding with no
truncation, no check against the full line width) appears in
`src/tui/components/docks/HelpMenu.ts` (`pad1`/`pad2` for the 3-column
shortcut grid) and `CommandPalette.render()` in
`src/tui/components/docks/CommandPalette.ts` doesn't even receive/use
`width` at all, so long command descriptions are never constrained.

Every other layout width in the codebase is computed as `termWidth - 1`
(see `FrameBuffer.ts`: `const safeWidth = Math.max(20, termWidth - 1);`),
specifically to leave one column of headroom so a full-width line doesn't
trip the terminal's own line-wrap. `StatusBar`/`HelpMenu`/`CommandPalette`
don't respect that margin, so on narrow terminals (or long model names /
token counts) they can legitimately hit `termWidth` exactly or exceed it.

By default terminals run with **DECAWM (Auto Wrap Mode) permanently on**
(`CSI ? 7 h`, VT100/xterm default) — a character emitted past the last
column forces a wrap to the next line
([man7 console_codes(4)](https://man7.org/linux/man-pages/man4/console_codes.4.html),
[vt100.net DECAWM](https://vt100.net/docs/vt510-rm/DECAWM.html)). That
silently consumes an extra on-screen row that `computeDocumentFrame`
never counted, which desyncs every row index below it — the diff-based
`StateRenderer` then believes an unrelated row is unchanged and skips
repainting it, which is what reads to the user as "text vanishing at the
bottom/left/right." Widening the terminal ("zooming out") increases
`termWidth` past the overflow threshold, which is exactly why that
"fixes" it — it's the direct symptom of an unclamped line, not a rendering
fluke.

### Bug C (structural, not a single bug) — no real layout engine, only ad hoc string math

There is no box model, no clipping, and no single source of truth for
"how wide is this component allowed to be." Every component
(`Header`, `StatusBar`, `HelpMenu`, `CommandPalette`, `ModelPicker`,
`SessionMenu`, `PermissionDock`) independently re-derives padding/columns
from `process.stdout.columns` or a passed `width`, with its own rounding
and its own (inconsistent) safety margins. `cell-layout.ts` is a solid,
correct ANSI-aware **word-wrapper**, but word-wrapping is only one half of
a layout system — there is no equivalent for **fixed-width/fixed-height
boxes, clipping, alignment, or z-ordering** (docks currently work by
literally unmounting `PromptInput`/`StatusBar` and mounting a dock in
their place — there's no concept of an overlay).

### Bug D (performance) — full-document relayout on every keystroke

`TerminalEngine.requestFrame()` → `StateRenderer.render()` →
`computeDocumentFrame()` → `layoutDocument()` iterates
**`tree.getNodes()`, i.e. every historical message plus every live
component**, on *every single frame* — including every keystroke typed
into `PromptInput`. `TextNode`/`UserMessageNode` cache their own wrapped
output keyed by `width`, so this is cheap only as long as the terminal
isn't resized and nothing needs to change — the moment anything does
(new message, resize, cursor blink inside the prompt), the entire
scrollback is re-walked and re-concatenated into `physicalRows` from
scratch. For a long session this is the "not blazing fast" part of the
request. This is addressed in Phase 4 below.

---

## 1. Verified terminal facts (used by this plan)

All confirmed against primary/authoritative sources, current as of 2026:

| Mechanism | Sequence | Source |
|---|---|---|
| Alternate screen buffer | `CSI ?1049h` / `CSI ?1049l` | already used correctly in `TerminalEngine.ensureAlternateScreen/exitAlternateScreen` |
| Focus tracking | enable `CSI ?1004h`, events `CSI I` / `CSI O` | already filtered correctly in `TerminalEngine.inputHandler`; xd already does what [anthropics/claude-code#10375](https://github.com/anthropics/claude-code/issues/10375) recommends |
| Synchronized output (batch a frame atomically) | begin `CSI ?2026h` (BSU), end `CSI ?2026l` (ESU) | [xterm.js PR #5453](https://github.com/xtermjs/xterm.js/pull/5453); spec gist ([christianparpart](https://gist.github.com/christianparpart/d8a62cc1ab659194337d73e399004036)). Already used in `StateRenderer`. **Caveat**: most terminals apply a spec-mandated ~1s safety timeout that force-flushes if `ESU` never arrives — never leave a `?2026h` unmatched across an `await`/async boundary. `StateRenderer.render()` currently opens+closes it synchronously within one call, which is correct; preserve that when refactoring. |
| Auto-wrap mode (DECAWM) | disable `CSI ?7l`, enable `CSI ?7h` | on by default in every terminal tested ([man7 console_codes(4)](https://man7.org/linux/man-pages/man4/console_codes.4.html), [vt100.net](https://vt100.net/docs/vt510-rm/DECAWM.html)) |
| Cursor visibility | `CSI ?25l` / `CSI ?25h` | already used correctly |
| Cursor position | `CSI {row};{col}H` (1-indexed) | already used correctly |
| Erase in line / display | `CSI 2K` (line), `CSI H CSI J` (full clear) | already used correctly. **Do not** call raw `\x1b[2J` while inside an open `?2026h` sync block — some terminals reset viewport scroll position when ED2 runs mid-sync ([xterm.js #5801](https://github.com/xtermjs/xterm.js/issues/5801)). Current code never does this inside a sync block (good) — keep it that way. |

Action: add `CSI ?7l` right after entering the alternate screen in
`ensureAlternateScreen()`, and `CSI ?7h` in `exitAlternateScreen()` /
`cleanupSync()`, as **defense in depth** on top of the width-clamping fix
in Phase 1. This makes an unclamped line fail safe (content gets
truncated/overwritten instead of silently eating a phantom row), instead
of being the difference between "renders fine" and "corrupts everything
below it."

## 2. Reference architecture (how the industry actually solves this)

Verified via multiple independent sources describing Ink (the
Yoga+React terminal renderer) and Claude Code's own custom
Ink-derived renderer:

> React commit → mutate terminal host nodes → run layout with Yoga →
> paint into a screen buffer → diff against the previous frame → compile
> terminal patches → flush a single buffered terminal write.
> ("How Claude Code Uses React in the Terminal", dev.to; corroborated by
> claude-code-architecture ch13 and claude-harness.dev's Ink pipeline
> writeup: `JSX → React Reconcile → Ink DOM → Yoga Layout → Screen Buffer
> → ANSI diff → stdout`.)

xd doesn't use React, and it doesn't need to — `Component.ts` is already a
small retained-mode component model (props/state/render). What xd is
missing is exactly the **middle three stages**: a real layout pass, a 2D
screen buffer (not an array of pre-wrapped strings), and a diff that
operates on that buffer. That's what `yoga_tar.gz` (provided) is for:
it's a **pure-TypeScript port of Facebook's Yoga** (no native binding, no
WASM) — confirmed by inspecting its exports (`Node.create`, `setWidth`,
`setFlexDirection`, `setMeasureFunc`, `getComputedLayout`, etc., a 1:1
surface of the real Yoga API). Because it's pure TS, it survives
`bun build --compile --minify` (the packaging step used in
`package.json`'s `compile` script) with zero native-binding headaches —
the exact problem that historically plagues `yoga-layout`'s WASM build
inside single-file compiled binaries. **This is why it was the right
library to hand to the agent for this job; use it, don't reach for
`yoga-layout` from npm.**

Key design point that makes this tractable without a rewrite: `Node`
supports `setMeasureFunc(fn)`, where `fn(width, widthMode, height,
heightMode) => {width, height}`. **`cell-layout.ts`'s `wrapVisualLine` is
already a correct, ANSI-aware, Unicode-width-aware word wrapper** — it
does not need to be replaced. It gets **repurposed** as the measure
function for Yoga "Text" leaf nodes: given a proposed width, return
`{ width: <=proposed, height: wrapped line count }`. Layout (box
positions) becomes Yoga's job; word-wrapping stays exactly the
well-tested code that exists today.

---

## 3. Target architecture

```
Component tree (existing Component.ts subclasses, extended)
        │  each component's render() returns a LayoutNode tree
        ▼
LayoutTree  (Box | Text primitives, flex props — thin wrapper over yoga-layout.ts)
        │  Yoga.calculateLayout(availableWidth, availableHeight)
        ▼
Computed boxes (x, y, width, height per node, all clipped to parent bounds by construction)
        │  paint pass: each Text leaf's content is wrapped (reusing wrapVisualLine)
        │  to its OWN computed width, then blitted into...
        ▼
ScreenBuffer   (2D grid: rows × cols of {char, styleRun}, exactly termHeight × termWidth-1)
        │  diff against previous ScreenBuffer, cell-run by cell-run
        ▼
ANSI patch compiler → StateRenderer (existing sync-update + cursor-position logic, kept)
        ▼
stdout
```

Why a `ScreenBuffer` (2D grid) instead of today's `string[]` of
pre-rendered rows: it makes "wider than the terminal" **structurally
impossible** — a box's content can never write outside its allotted
`(x, y, width, height)` rectangle because the paint step clips at
blit-time, not by hoping every component's math is correct. This is what
actually fixes Bug B/C as a class, not just the two call sites found
today.

### New files to add (do not delete anything until the parity phase says so)

```
src/tui/layout/
  yoga.ts                # re-export from the provided yoga-layout.ts/enums.ts, pinned locally
  LayoutNode.ts           # Box / Text node definitions + builder helpers (box(), text())
  buildYogaTree.ts        # LayoutNode tree -> yoga-layout.ts Node tree, incl. Text measureFunc
  ScreenBuffer.ts         # 2D cell grid: alloc, clear, blit(text, x, y, width, clip), diffAgainst()
  paint.ts                # walks computed Yoga layout + LayoutNode tree, blits into ScreenBuffer
  index.ts                # public API: layoutAndPaint(rootNode, width, height) -> ScreenBuffer
```

### Component contract change

Add an **opt-in** second render mode so migration is incremental and
nothing has to move in one shot:

```ts
// Component.ts — additive, non-breaking
renderLayout?(width?: number, height?: number): LayoutNode; // new, optional
```

`TerminalEngine`/`DocumentTree` check `renderLayout` first; if a component
doesn't implement it, fall back to today's `render()` → `string[]` path
wrapped in an implicit single `Text` LayoutNode (`Overflow.Hidden`,
width = parent width). This means **Phase 3 can ship with only
`StatusBar`, `HelpMenu`, and `CommandPalette` (the three overflow-prone
components) migrated**, while `Header`/docks/history text keep working
exactly as before, unclipped-string-path, until they're migrated too.

---

## 4. Phased implementation plan

Each phase is independently shippable and independently testable. Do
them in order. Do not start Phase 3 before Phase 1 and 2 are merged and
verified — Phase 1/2 are the actual bug fix and are low-risk; Phase 3+ is
the larger rebuild the user asked for and carries real regression risk,
so it must land on top of a codebase that isn't already broken.

### Phase 0 — Immediate hotfix (ship first, today)

Goal: stop `/skills` (and any other multi-line command result) from
corrupting the frame, with minimal-diff changes.

1. **`src/tui/utils/message-formatter.ts`** — fix `formatSystemMessage` to
   split on `\n` and return one array entry per line, matching every
   other formatter in this file (`formatAssistantMessage` already does
   `content.split('\n')` — `formatSystemMessage` is the outlier):
   ```ts
   export function formatSystemMessage(content: string): string[] {
     const theme = getTheme();
     const infoColor = themeColor(theme.permission);
     const rawLines = content.split('\n');
     return rawLines.map((l, i) =>
       i === 0 ? infoColor(`${figures.info} ${l}`) : infoColor(`  ${l}`),
     );
   }
   ```
2. **`src/tui/engine/cell-layout.ts`** — add defense in depth so a stray
   `\n`/`\r` reaching `wrapVisualLine` can never again silently corrupt a
   row. At the top of `wrapVisualLineWithCursor`, before tokenizing,
   assert/strip control characters other than the ANSI CSI sequences
   already handled:
   ```ts
   // A logical "line" must never contain a raw line break — normalize
   // defensively; upstream producers are responsible for pre-splitting.
   text = text.replace(/\r\n|\r|\n/g, ' ');
   ```
   (Replace with a space, not empty string, so word boundaries aren't
   accidentally glued together if this ever fires — it should be
   unreachable after fix #1, this is a safety net, not the primary fix.)
3. **`src/tui/components/StatusBar.ts`** — truncate `right` instead of
   clamping padding to 1:
   ```ts
   const leftWidth = stringWidth(stripAnsi(left));
   let rightWidth = stringWidth(stripAnsi(right));
   const minGap = 1;
   const maxRightWidth = Math.max(0, termWidth - 1 - leftWidth - minGap);
   if (rightWidth > maxRightWidth) {
     // drop the token-count segment first, then hard-truncate the model id
     right = chalk.dim(model.modelId || `${model.provider}/${model.modelId}`);
     rightWidth = stringWidth(stripAnsi(right));
     if (rightWidth > maxRightWidth) {
       right = truncateToWidth(right, maxRightWidth); // add helper, see below
       rightWidth = maxRightWidth;
     }
   }
   const spaceCount = Math.max(1, termWidth - 1 - leftWidth - rightWidth);
   ```
   Add a small `truncateToWidth(styledText, maxWidth)` helper to
   `src/tui/utils/format.ts` that strips ANSI, slices to `maxWidth - 1`
   visible columns via `string-width`-aware slicing, and re-appends a
   reset code — this will be reused in Phase 1, write it once.
4. **`src/tui/components/docks/HelpMenu.ts`** and
   **`src/tui/components/docks/CommandPalette.ts`** — pass `width` through
   in `CommandPalette` (it's dropped today) and truncate `desc`/`name` to
   fit, using the same `truncateToWidth` helper; clamp the final assembled
   row's total width to `termWidth - 1` (not just per-segment padding) in
   both files.

**Acceptance for Phase 0**: run `/skills` in a repo with 10+ skills at
80, 60, and 40 columns; run `/skills` then immediately type without
resizing/resuming; confirm the prompt box and cursor stay correctly
positioned in all cases. Add a regression test (see Phase 5) that feeds
a multi-line command message through `formatSystemMessage` →
`wrapVisualLine` and asserts the output array never contains an entry
whose raw string includes `\n`.

### Phase 1 — Hard width invariant across the whole engine

Goal: make "a produced row is wider than the terminal" impossible to ship
again, engine-wide, independent of the Yoga rewrite.

1. In `src/tui/engine/cell-layout.ts`, add an exported
   `assertRowWidth(row: string, maxCols: number): string` used at the
   single choke point where physical rows are finalized — inside
   `measureNode()`'s row-push loop in the same file. If
   `stringWidth(stripAnsi(row)) > maxCols`, hard-truncate with
   `truncateToWidth` (moved/shared from Phase 0) rather than trusting the
   caller. This turns Bug B/C into something that degrades gracefully
   (visible truncation) instead of corrupting the whole frame.
2. Add a `DEBUG_TUI_OVERFLOW` env-gated warning (write to a log file, never
   to stdout/stderr while in the alternate screen) whenever
   `assertRowWidth` actually has to truncate something — this gives you a
   free inventory of every remaining unclamped component to fix in
   Phase 3, from real usage, before you migrate them.
3. **`src/tui/engine/TerminalEngine.ts`** — add DECAWM disable/enable:
   ```ts
   ensureAlternateScreen(): void {
     if (!this.inAlternateScreen) {
       process.stdout.write('\x1b[?1049h\x1b[?1004h\x1b[?7l\x1b[H');
       ...
   ```
   and restore it symmetrically in `exitAlternateScreen()` /
   `cleanupSync()` with `\x1b[?7h` before `\x1b[?1049l`. This is
   defense-in-depth on top of #1, not a replacement for it — Windows
   Terminal has had bugs with DECAWM state leaking across buffers
   ([microsoft/terminal#12194](https://github.com/microsoft/terminal/issues/12194)),
   so #1's hard clamp is the real fix; DECAWM-off is a second net.

**Acceptance for Phase 1**: fuzz test — generate random ANSI-styled
strings of random widths (including exactly `termWidth`, `termWidth+1`,
`termWidth-1`) at terminal widths 20/40/80/120/200, feed through every
component's `render()`, assert `stringWidth(stripAnsi(row)) <= termWidth - 1`
for every returned row, for every component, at every width. This test
alone should be considered a release gate from now on — wire it into
`bun test`.

### Phase 2 — `ScreenBuffer` primitive (no Yoga yet, no behavior change)

Introduce `src/tui/layout/ScreenBuffer.ts` as a standalone, independently
tested unit before touching the render pipeline:

```ts
export class ScreenBuffer {
  constructor(width: number, height: number);
  clear(): void;
  blitText(x: number, y: number, maxWidth: number, styledText: string): void; // clips hard at maxWidth, splits ANSI-safely
  getRow(y: number): string; // reconstructs one terminal row incl. SGR resume codes
  diff(prev: ScreenBuffer): Array<{ row: number; text: string }>; // row-level diff, same contract StateRenderer already expects
}
```

Re-point `StateRenderer.render()` at `ScreenBuffer.diff()` instead of its
current manual `previousLines`/`nextLines` array comparison — same
external behavior, same synchronized-update/cursor logic, just backed by
a real 2D structure. This is a refactor with **zero visible behavior
change** if done right; ship it and verify pixel-for-pixel (byte-for-byte
stdout capture) identical output to before on a fixed test transcript
before moving on.

### Phase 3 — Yoga integration + reconciler

1. Add `src/tui/layout/yoga.ts`, `LayoutNode.ts`, `buildYogaTree.ts`,
   `paint.ts` per the file list in section 3.
2. `LayoutNode` shape (keep intentionally small — this is not trying to
   clone all of CSS, only what xd's components actually need):
   ```ts
   type LayoutNode =
     | { type: 'box'; direction: 'row' | 'column'; children: LayoutNode[];
         width?: number | 'auto' | `${number}%`; height?: number | 'auto';
         padding?: number; gap?: number; justify?: Justify; align?: Align;
         overflow?: 'visible' | 'hidden' }
     | { type: 'text'; content: string; wrappable?: boolean; maxWidth?: number };
   ```
3. `buildYogaTree.ts`: for `type: 'text'` leaves, call
   `node.setMeasureFunc((width) => { const lines = wrapVisualLine(stripStyles ? content : content, Math.floor(width)); return { width: Math.min(width, maxLineWidth(lines)), height: lines.length }; })` —
   reusing the existing, correct wrapper from `cell-layout.ts` verbatim.
4. `paint.ts`: post-order walk of the computed tree; for each `text` leaf,
   re-wrap its content to `getComputedWidth()` (same function, now called
   with the box's real final width) and `ScreenBuffer.blitText(x, y,
   computedWidth, line)` per output line, one call per wrapped line,
   `y` incrementing — this is the enforcement point, blit is hard-clipped
   by construction (Phase 2's `blitText` contract), so even a bug in a
   migrated component's declared width can't leak into a sibling's
   rectangle.
5. Add `Component.renderLayout?()` per section 3's contract. Migrate, in
   this order (highest overflow-risk first, using the
   `DEBUG_TUI_OVERFLOW` log from Phase 1 step 2 to confirm you got them
   all): `StatusBar` → `CommandPalette` → `HelpMenu` → `ModelPicker` →
   `SessionMenu` → `PermissionDock` → `Header`. Leave `TextNode`/
   `UserMessageNode` (scrollback history) on the legacy string path for
   now — see Phase 4, they get a different treatment for perf reasons,
   not a Yoga tree (flowed scrollback text doesn't benefit from a box
   model; it's already correctly served by `wrapVisualLine`).
6. Docks stop being "unmount input, mount dock in its place" and become a
   `position: 'absolute'`-style overlay box (Yoga `PositionType.Absolute`)
   painted on top of the live region — this removes an entire class of
   "what was mounted before the dock, and did I restore it correctly"
   bookkeeping currently duplicated in `app.ts` (`closeModal`,
   `openHelp`, `openModelPicker`, `requestConfirmation` all repeat the
   same unmount/remount dance).

**Acceptance for Phase 3**: same fuzz test as Phase 1, now run against
migrated components' `renderLayout()` output post-paint — should pass
trivially since clipping is structural now, but keep the test (it's your
regression guard for the *unmigrated* components still on the legacy
path). Add golden-output snapshot tests per migrated component at
40/80/120/200 columns.

### Phase 4 — Scrollback performance (the "blazing fast" ask)

Today, `layoutDocument()` walks the **entire** `tree.getNodes()` array
every frame. Split immutable history from the live region:

1. `DocumentTree` already conceptually separates `historyNodes` (pushed
   once, immutable) from `liveNodes` (mounted components, re-rendered
   often). Exploit that: maintain a **persistent cache of
   `physicalRows` per history node**, keyed by `(nodeId, width)`, computed
   **once** when the node is added or when width changes (resize), never
   recomputed on a live-region-only re-render.
2. `layoutDocument()` becomes: `[...cachedHistoryRows, ...freshLiveRows]`
   — history rows are a cheap array-concat (or better, keep a running
   flattened array and only `.push()` new history rows as they arrive,
   never re-flatten what's already there), live rows are recomputed from
   the (now typically 3-5 node) live region only.
3. On resize: invalidate and recompute the **history row cache once**
   (already debounced 50ms in `TerminalEngine`'s `resizeHandler` — keep
   that), not on every keystroke.
4. Add a perf test: seed 2,000 history entries, measure `requestFrame()`
   wall time for a single keystroke in `PromptInput` before/after — this
   should go from O(total history) to O(live region size), i.e. flat
   regardless of scrollback length.

### Phase 5 — Test matrix & sign-off

1. **Unit/regression** (run in CI via `bun test`):
   - `formatSystemMessage` never emits an array entry containing `\n`.
   - Width-fuzz test from Phase 1 (release gate).
   - `ScreenBuffer.blitText` clipping unit tests (exact-width, off-by-one,
     wide unicode/emoji, zero-width joiners, combining chars — reuse
     `string-width`'s own edge-case fixtures if available).
   - `wrapVisualLineWithCursor` ANSI-style-carry-across-wrap tests (already
     partially implied by existing code; make explicit).
   - Perf test from Phase 4.
2. **Manual terminal matrix** — verify `/skills` output + resize + a dock
   opened over a long scrollback, in each of: VS Code integrated terminal,
   Windows Terminal, iTerm2, Alacritty, Kitty, Ghostty, tmux (inside one
   of the above), and over SSH through at least one of them. Confirm
   `CSI ?2026$p` (DECRQM) feature-detection isn't required today (the
   code doesn't gate on it), but note it as a follow-up if a terminal in
   the matrix turns out not to support mode 2026 (falls back silently to
   un-synchronized output today, which is acceptable, not a regression).
3. Only after Phase 5 passes: delete the legacy `render()` string path for
   the components migrated in Phase 3 (keep it for history text nodes,
   see Phase 4 note — that path is correct and fast for flowed text and
   is not being replaced).

---

## 5. Order of operations for the agent (do exactly this, in this order)

1. Phase 0, steps 1-4. Commit. This alone fixes the reported bug.
2. Phase 1, steps 1-3 + acceptance fuzz test. Commit.
3. Phase 2 (ScreenBuffer, byte-identical-output verification). Commit.
4. Phase 3, in the component order listed. Commit per component.
5. Phase 4. Commit.
6. Phase 5, full matrix, sign-off.

Do not reorder: Phase 3 depends on Phase 2's `ScreenBuffer` contract;
Phase 2's "byte-identical" gate depends on Phase 1 already having fixed
the width-overflow bugs (otherwise you'd be enshrining broken behavior as
the "golden" output to match).

