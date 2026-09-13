# xd — Production-Grade Hardening Plan

Snapshot: `xd_wit.xml`, 108 files, ~9.8k LOC TypeScript/Bun. `ai@7.0.97` + `@ai-sdk/{anthropic,google,openai,openai-compatible}`, `zod@4`. This plan is built entirely from the actual source (`src/**`), `package.json`, `.agents/skills/ai-sdk/SKILL.md`, `.agents/skills/migrate-ai-sdk-v6-to-v7/SKILL.md`, and current AI SDK 7 semantics. The prior `plan.md` in the snapshot was not read and is not referenced anywhere below.

---

## 1. Executive Summary

xd's runtime loop (`agent-runner.ts` → `streamText`) is already correctly written against AI SDK 7 (`instructions`, `stopWhen: isStepCount(...)`, `result.responseMessages`) — **do not migrate to `ToolLoopAgent`** (reasoning in §7). The real production-readiness gaps are architectural, not API-version gaps:

1. **Session storage duplicates every large payload three ways** (`SessionTurn.toolCalls[].result`, `SessionTurn.rawMessages`, and tool-output preview fields), is rewritten wholesale with a single `writeFileSync` per turn, has no schema version, and cannot survive a crash mid-write or a hand-edited/corrupted file.
2. **Full file contents and full diffs flow untruncated through tool execute → confirmation UI → session file**, three separate times, with no size limit anywhere in the chain.
3. **The diff engine is O(M·N) time *and* memory** (`utils/diff.ts::computeLineDiff`, LCS dynamic-programming matrix) and is invoked eagerly and unconditionally in `PermissionDock`'s constructor — before the user ever presses `f` — on every `edit_file` confirmation, regardless of file size.
4. **The TUI re-lays out the entire document history on every frame** (`FrameBuffer.ts::computeDocumentFrame` → `cell-layout.ts::layoutDocument` walks the whole `DocumentTree`), even though the terminal-write path (`StateRenderer`) already does correct row-level diffing. History is immutable once committed but is not treated as such by layout.
5. **Session resume silently degrades**: if a persisted turn has no `rawMessages` (interrupted turn, or old-format file), `AgentSession` reconstructs it as a single user/assistant string pair and **drops every tool call**, corrupting the model's view of its own history on resume.
6. Test surface is a single 111-line file (`tests/showcase.test.ts`); there is no coverage for sessions, tool execution, diffing, or the TUI.

None of this requires new frameworks, a database, or a rewrite of the custom TUI. The plan below is a bounded set of surgical changes to `session/`, `tools/`, `utils/diff.ts`, `tui/components/docks/PermissionDock.ts`, and `tui/engine/`.

---

## 2. Verified Findings

Each finding: file → symbol → root cause → consequence → correction → verification.

### F1 — Session document stores the same content three times
`src/session/types.ts::SessionTurn` has `toolCalls: ToolResultInfo[]` (each with a full, untruncated `result: unknown` — see `engine/types.ts::ToolResultInfo`) **and** `rawMessages?: ModelMessage[]` (the AI SDK's own tool-call/tool-result messages, which already contain the same tool outputs). `agent-session.ts::submitPrompt` step 6 passes both to `recordSessionTurn`. For an `edit_file` call this means the full pre-image, full post-image, and full diff-line array (`EditFileOutput.allLines`, `.previewLines`, `.diffLines`) are serialized once inside `toolCalls[].result` and the tool-result content is serialized *again* inside `rawMessages`.
- Consequence: session files grow multiplicatively with edit size; a single 2000-line file edit can add >100KB to the JSON for information that's already recoverable from `rawMessages` alone.
- Correction: `rawMessages` (or its replacement, see §6) becomes the single source of truth for "what must be resent to the model." `toolCalls` becomes a bounded, UI-facing summary (id, name, args-summary, status, duration, small preview) — never the full `result`.
- Verification: a fixture turn with a 5000-line `write_file` call produces a session file under a fixed byte budget (test in §13).

### F2 — `saveSession` is a full non-atomic rewrite on every turn
`src/session/store.ts::saveSession` calls `writeFileSync(filePath, JSON.stringify(session, null, 2) + '\n', 'utf-8')` directly against the live path. `recordSessionTurn` calls this after every single turn.
- Consequence: a process kill, OOM, or disk-full error during `writeFileSync` truncates or corrupts the on-disk file in place — the previous valid turn history is destroyed, not just the new turn. There is no journal, no backup, no partial-write protection.
- Correction: temp-file + atomic rename (§6).
- Verification: kill the process (SIGKILL) mid-write in a test harness that stalls the write; assert the original file is untouched or the new file is complete — never partial.

### F3 — No schema version, no corruption handling, silent data loss on parse failure
`store.ts::loadSession` and `listSessions` wrap `JSON.parse` in bare `try { } catch { return null }` / `catch { /* skip */ }`. A corrupted or partially-written file is silently treated as "does not exist" (`loadSession`) or silently omitted from the list (`listSessions`) — the user gets no diagnostic that a session was lost. `SessionData` has no `schemaVersion` field at all, so there is no way to distinguish "corrupt" from "old format" from "not yet migrated."
- Correction: versioned schema + explicit corrupted-session quarantine path (§3, §6).
- Verification: load a truncated JSON file and a valid-JSON-wrong-shape file; both must surface a diagnostic, not disappear silently.

### F4 — Resume reconstruction drops tool calls when `rawMessages` is absent
`agent-session.ts` constructor, lines 54–67: for each stored turn, if `turn.rawMessages` is missing or empty, it falls back to pushing only `{role:'user', content: turn.userPrompt}` and `{role:'assistant', content: turn.assistantText}` — **all tool-call/tool-result messages for that turn are discarded**. This happens for: (a) any turn recorded before `rawMessages` existed in the schema, (b) any turn where the catch block in `submitPrompt` (lines 210–221) persisted a partial `summary` from an aborted/errored turn where `rawMessages` may be empty.
- Consequence: on `/resume`, the model can be resent a conversation where it "remembers" saying it called a tool (via `assistantText`, if that even captured it) but the tool-call/result messages proving it don't exist — this is exactly the "tool call without result" / "invalid message ordering" hazard called out as a hard failure mode.
- Correction: canonical turn schema always derives replay messages from a single normalized message log (§6); no dual-path reconstruction.
- Verification: interrupted-turn resume test in §13.

### F5 — Full file content and diff duplicated through the confirmation pipeline
`tools/edit-file/index.ts::getConfirmationRequest` reads the whole file, computes `newContent` via string replace, and puts **both full `oldContent` and full `newContent`** into `ConfirmationRequest.args` (types.ts `ConfirmationRequest.args: Record<string, unknown>`). `catalog.ts::toAISDKTools` passes this request untouched to `context.requestConfirmation`. `PermissionDock`'s constructor (lines 47–65) then reruns `computeLineDiff(oldContent, newContent)` — a **second, independent** diff computation on the same edit (the first happened inside `edit-file/index.ts::execute` at line 116, producing `diffLines` that are never passed to the confirmation step because `getConfirmationRequest` runs *before* `execute`). `write_file`'s `getConfirmationRequest` puts the **entire file content** into `args.content`, and `PermissionDock` splits it into one `DiffLine` per line unconditionally, even if the dock is never scrolled into review mode.
- Consequence: (a) diff computed twice per edit for no reason, (b) confirmation dialog construction cost and memory are proportional to whole-file size even for a one-line change, (c) `run_command`'s full command string flows through unbounded too.
- Correction: `getConfirmationRequest` returns a **bounded preview** (capped line count/byte count) plus enough metadata to lazily compute a full diff only if/when review mode (`f`) is opened; `execute()`'s already-computed diff (or the tool's own bounded stats) becomes the one and only diff computation per edit (§9).
- Verification: confirmation-construction benchmark on a 50k-line file must stay O(preview window), not O(file).

### F6 — `computeLineDiff` is O(M·N) time and memory
`utils/diff.ts::computeLineDiff` builds a full `(M+1)×(N+1)` dynamic-programming matrix (`dp: number[][]`) to compute an LCS-based diff, with no size guard. It is called eagerly and unconditionally in `PermissionDock`'s **constructor**, i.e. it runs the moment the dock is *mounted*, not when the user opens full review.
- Consequence: for a 10,000-line file, `dp` alone allocates ~10⁸ numbers (~800MB as a dense `number[][]` of arrays); for smaller-but-nontrivial files it still measurably stalls the single-threaded TUI render loop, freezing keystroke handling exactly as the "large-content bug" the review is meant to root out.
- Correction: cap-and-fallback diff strategy (§9): use LCS diff only under a line/byte threshold; above threshold, use a cheap line-hash-based diff (Myers-style with O(N·D) using difference count, or a simple prefix/suffix-trim + hash bucketing) or fall back to a "changed: N lines added, M removed, no inline preview" summary. Never allocate an M×N matrix.
- Verification: `computeLineDiff` on a fixture pair of 50,000-line files must complete under a fixed time budget and bounded memory in a test (§13); `PermissionDock` construction must not call the full diff algorithm before `isReviewing` is true for inputs above the threshold.

### F7 — TUI re-lays out full history every frame
`tui/engine/FrameBuffer.ts::computeDocumentFrame` calls `layoutDocument(tree, safeWidth, forceAll, lineWidthCache)` (`cell-layout.ts`) which walks the entire `DocumentTree` to produce `physicalRows`/`totalPhysicalRows`, then slices a viewport out of the *complete* result. This runs on every call to `StateRenderer.render`, which `TerminalEngine` invokes on every keystroke, stream chunk, and resize (needs confirmation of call sites in Phase 8, but `computeDocumentFrame`'s signature and lack of any per-node memoization/dirty-tracking confirms the whole-tree walk). The `lineWidthCache: Map<string, number>` passed in only memoizes individual string-width measurements, not layout results — it does not make this O(viewport).
- Consequence: as a session's `HistoryStore` grows (it is append-only and never trimmed — `HistoryStore.push` only appends, `getAllLines`/`getPrimaryScreenLines` flatten everything), every keystroke's cost grows linearly with total conversation length. A long session becomes progressively less responsive.
- Correction: treat committed `HistoryEntry` blocks as immutable and cache their layout (physical row count + rendered rows) keyed by `(entry.id, width)`, invalidated only on resize; only re-lay-out active/live components (streaming view, prompt input, docks) each frame, then splice cached history rows with fresh live rows for the viewport slice (§11).
- Verification: layout cost for a fixed-size keystroke event must be independent of total history length (measured in a synthetic history of 10k vs 100k entries — see §13 performance tests).

### F8 — `HistoryStore` has no bounds and full-array `getAllLines`
`tui/engine/HistoryStore.ts` is a plain append-only array with no cap, no eviction, and `getAllLines()`/`getPrimaryScreenLines()` do a full `flatMap` over every entry on every call site that needs them.
- Consequence: compounds F7 — even if layout is fixed to be viewport-bounded, any remaining full-array consumer (e.g. primary-screen flush on exit) is O(history) by design, which is acceptable *only* if it's called O(1) times (verify call sites in Phase 8), not per-frame.
- Correction: keep `HistoryStore` as the durable ordered log (it's fine for infrequent full flushes) but make sure no per-frame path calls `getAllLines`; add a `getRange`/cursor-based accessor for the layout cache to consume incrementally instead of re-flattening.
- Verification: static call-site audit (grep) confirms `getAllLines`/`getPrimaryScreenLines` are only invoked on exit/history-flush paths, not from `StateRenderer.render` or its callers.

### F9 — Confirmation dock cannot express "already denied a similar op this session" or partial approval scoping
`catalog.ts::toAISDKTools` only tracks a flat `sessionAllowlist: Set<string>` keyed by **tool name**, not by target (path/command). `allow_session` for `edit_file` permanently allows *all* future edits to *any* file for the rest of the session with no way to scope it — this is a design/UX correctness gap adjacent to the safety work, noted here because §5's canonical tool-call model needs to decide whether to preserve this coarse-grained behavior or scope it; flagged for a product decision, not silently changed (see Phase 5 acceptance criteria).

### F10 — No test coverage for sessions, tools, diff, or TUI
`tests/showcase.test.ts` (111 lines) is the entire test suite. `package.json`'s `test` script is `bun test`. None of the failure modes in F1–F8 have regression coverage. Phase 0 must establish characterization tests before any refactor (§13, §16).

---

## 3. Root Causes

| Finding | Root cause |
|---|---|
| F1, F4 | `SessionTurn` conflates three distinct concerns — durable replay state, UI summary state, and raw provider wire format — into one flat shape with two independently-populated, inconsistently-reconstructed fields. |
| F2, F3 | Persistence was implemented as "serialize whole object to disk," never revisited once turn payloads grew large; no journal/atomicity primitive was ever introduced. |
| F5, F6 | Tool `execute()` and `getConfirmationRequest()` are two independent code paths that both derive diff/content data from the same edit, because `ConfirmationRequest.args: Record<string, unknown>` is untyped and treated as a dumping ground rather than a normalized, bounded contract. |
| F7, F8 | The TUI's rendering model has exactly one abstraction level (`DocumentTree` → full layout → screen diff); there is no distinction between immutable committed history and live/active content, so nothing can be cached across frames. |
| F10 | No test infrastructure was established alongside the persistence/diff/confirmation code as it grew in complexity. |

---

## 4. Target Architecture

```
AI SDK stream (streamText)
        │  chunk events (text-delta / tool-call / tool-result / tool-error / finish-step)
        ▼
agent-runner.ts            — unchanged shape, still emits AgentEvent
        │  AgentEvent  (engine/events.ts)
        ▼
Canonical tool-call lifecycle (NEW: engine/tool-lifecycle.ts)
        │  normalized ToolCallRecord (bounded, typed, single representation)
        ├──────────────► Runtime state (in-memory, agent-session.ts)
        ├──────────────► Durable session state (NEW: session/schema.ts, versioned, atomic)
        └──────────────► TUI presentation state (HistoryStore entries, PermissionDock props)
```

Four state categories, kept explicitly separate (per the review brief):
- **Runtime state**: `AgentSession`'s in-memory `messages: ModelMessage[]` — what's needed mid-execution.
- **Model conversation state**: the `ModelMessage[]` actually sent back to the provider on the next turn — sourced *only* from normalized turn message logs, never reconstructed from UI strings.
- **Durable session state**: the versioned `SessionDocument` on disk (§6) — bounded, atomic, migratable.
- **TUI presentation state**: `HistoryStore` entries and dock props — derived, ephemeral, never a source of truth, never fed back into persistence.

---

## 5. Invariants

Non-negotiable, checked by tests where feasible:

- **I1**: A tool result's full payload is stored in at most one place. Everywhere else, a bounded summary/preview is used.
- **I2**: No session file write can leave `~/.xd/sessions/**/*.json` in a state that fails to parse as valid JSON matching the current or a migratable schema version.
- **I3**: `AgentSession` resume always reconstructs `ModelMessage[]` from one normalized source per turn — never a userPrompt/assistantText fallback that silently drops tool calls.
- **I4**: No diff computation allocates memory proportional to `oldLines.length * newLines.length`.
- **I5**: Constructing a `PermissionDock` (mount) never performs an O(file size) computation; only entering review mode may, and only up to a capped bound.
- **I6**: The cost of handling one keystroke/stream-chunk event in the TUI does not grow with total conversation history length.
- **I7**: A raw newline/carriage-return inside any rendered string can never corrupt more than the single logical row it belongs to (existing `ScreenBuffer`/row-diff model — preserved, not weakened, by any change here).
- **I8**: Every `ToolCallRecord` has a stable ID unique within its session, assigned once at `tool-call` event time and never regenerated.

---

## 6. Session/Persistence Design

### 6.1 Schema (new file `src/session/schema.ts`, replaces ad hoc types in `session/types.ts`)

```ts
export const SESSION_SCHEMA_VERSION = 2;

export interface SessionDocumentV2 {
  schemaVersion: 2;
  id: string;
  name: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  model: ModelSelection;
  totalUsage: TokenUsage;
  turns: SessionTurnV2[];
}

export interface SessionTurnV2 {
  id: string;
  timestamp: string;
  status: 'complete' | 'interrupted' | 'errored';
  userPrompt: string;
  assistantText: string;
  reasoning?: string;
  usage: TokenUsage;
  /** Single source of truth for model replay — normalized ModelMessage[] for this turn only. */
  messages: ModelMessage[];
  /** Bounded, UI-facing summaries only — never full tool result payloads. */
  toolCallSummaries: ToolCallSummary[];
}

export interface ToolCallSummary {
  id: string;
  name: string;
  status: 'completed' | 'failed' | 'denied' | 'aborted';
  argsSummary: string;   // truncated, e.g. path or first N chars of command
  durationMs?: number;
  isError: boolean;
  /** Bounded preview only (see §9), not the full result. */
  resultPreview?: string;
  resultTruncated: boolean;
}
```

`toolCalls: ToolResultInfo[]` and the dual `rawMessages` field are removed. `messages` is populated directly from `TurnSummary.rawMessages` (already produced by `agent-runner.ts` — no change needed there); `toolCallSummaries` is derived from `TurnSummary.toolCalls` by truncating `result` through the bounding function in §9 rather than storing it whole.

### 6.2 Atomic persistence (`session/store.ts::saveSession` rewrite)

Replace direct `writeFileSync(filePath, ...)` with:
1. Write to `filePath + '.tmp-' + randomUUID().slice(0,8)` in the same directory (same filesystem, so rename is atomic).
2. `fsyncSync` the temp file descriptor (open with `'w'`, write, `fsync`, close) before rename — protects against reordered writes on crash.
3. `renameSync(tmpPath, filePath)` — atomic on POSIX and Windows (NTFS) for same-volume renames.
4. On any failure mid-sequence, delete the temp file (best-effort) and rethrow — the original `filePath` is never touched until the rename succeeds, satisfying I2.

Serialize writes per session: `AgentSession`/`store.ts` must not allow two concurrent `saveSession` calls for the same `id` to race (single-writer-per-process is already true given `isGenerating` guards submission, but add an in-module `Map<sessionId, Promise>` write-queue in `store.ts` so `saveSession` always awaits the prior write for that id before starting a new one — cheap insurance against future concurrent callers, e.g. a future background auto-save).

### 6.3 Validation & corrupted-session recovery

New `session/validate.ts`:
- `parseSessionDocument(raw: string): { ok: true; doc: SessionDocumentV2 } | { ok: false; reason: 'invalid-json' | 'schema-mismatch' | 'unknown-version'; raw: string }` using a Zod schema mirroring §6.1 (project already depends on `zod@4`).
- `loadSession` (store.ts) calls this instead of bare `JSON.parse`. On `ok:false`:
  - Move the offending file to `~/.xd/sessions/<date>/.quarantine/<id>.json` (create dir if needed) rather than deleting or silently skipping it.
  - Return a discriminated result (`{ recovered: false, reason, quarantinedPath }`) instead of `null`, so callers (`/resume` command, `listSessions`) can surface a diagnostic ("Session abc123 could not be loaded (invalid-json) and was moved to quarantine") instead of the file silently vanishing.
- `listSessions` uses the same validator; unparsable files are counted and reported (e.g. "3 sessions skipped — see `/resume --recover`") rather than swallowed.

### 6.4 Interrupted / partial turns

`agent-session.ts::submitPrompt`'s catch block (lines 210–221) already tries to persist a partial `summary`. Formalize this: `SessionTurnV2.status` is set to `'interrupted'` (abort) or `'errored'` (exception) in that path, with `messages` populated from whatever `summary.rawMessages` exists at that point (may be empty — that's fine, it's explicit, not silently dropped as a fallback). On resume, `AgentSession` filters: an `'interrupted'`/`'errored'` turn's `messages` are still replayed as-is (they represent exactly what was sent/received before interruption); no fallback reconstruction path exists at all (removes F4's dual path entirely — there is only one path: `messages`).

### 6.5 IDs, ordering, large-result handling

- Turn IDs (`randomUUID()`) and tool-call IDs (from `chunk.toolCallId`, already stable per AI SDK) are preserved as-is; `ToolCallSummary.id` must equal the corresponding tool-call/tool-result ID inside `messages` for that turn (test-checked, §13).
- Ordering: `turns` array order is append-only and authoritative; no reordering logic exists or is needed.
- Large-result handling: implemented once, in the bounding function shared by session summaries and confirmation previews — see §9.

### 6.6 Migration

New `session/migrate.ts`:
- `migrateSessionDocument(raw: unknown, fromVersion: number | undefined): SessionDocumentV2`.
- v1 (current, unversioned) → v2: for each old `SessionTurn`, if `rawMessages` present and non-empty, use it as `messages` and set `status: 'complete'`; if absent, set `status: 'interrupted'` and `messages: []` (explicit data-loss acknowledgment for pre-existing files, logged once, rather than the silent fallback reconstruction F4 does today) — build `toolCallSummaries` from the old `toolCalls` by truncating each `result` through the §9 bounding function.
- `loadSession` runs migration transparently on load when `doc.schemaVersion` is missing or less than `SESSION_SCHEMA_VERSION`, then re-saves via the atomic path so the file is upgraded in place on next write (not forced eagerly, to avoid touching every file on first run of the new binary — lazy migration on next access).
- Users are never required to delete `~/.xd/sessions`.

---

## 7. Agent/AI SDK Design

**Decision: keep the custom `streamText` orchestration in `agent-runner.ts`. Do not adopt `ToolLoopAgent`.**

Reasoning, weighed against xd's actual requirements:
- xd needs per-chunk terminal streaming (`text-delta`/`reasoning-delta` piped live into `StreamingView`), an interactive per-tool-call confirmation gate injected *between* model tool-call and tool execution (`ToolCatalog.toAISDKTools`'s `execute` wrapper), mid-turn abort via `AbortSignal` wired to a UI keypress, and a bespoke `AgentEvent` union consumed by the TUI. `streamText`'s `result.stream` async iterator already gives direct access to every one of these primitives (`chunk.type` switch in `agent-runner.ts`) with full control over ordering and side effects.
- `ToolLoopAgent` is a higher-level convenience wrapper over the same primitives, aimed at apps that don't need to intercept the loop between tool-call and tool-execution for interactive approval, and don't need a custom event model per chunk. Adopting it would mean either (a) losing the fine-grained confirmation-gate injection point, or (b) reimplementing an equivalent low-level escape hatch inside it — netting no simplification while adding a migration risk surface.
- The one thing worth adopting from current v7 idiom regardless: `agent-runner.ts` already uses `instructions` (not `system`) and `isStepCount` (not the removed `stepCountIs`) — confirm these stay pinned to current API on every AI SDK bump per `.agents/skills/ai-sdk/SKILL.md`'s "never trust memory" rule; add this check to Phase 11's release gate.

No change to `agent-runner.ts`'s core structure. Two targeted fixes inside it:
- **Tool-call ID stability** (already correct — `chunk.toolCallId` is provider-assigned and stable; verify with a test that the same ID appears in `tool-call`, `tool-result`/`tool-error`, and the final `rawMessages` for a turn).
- **`finishReason`/`stopReason` on error path**: currently `runAgentTurn`'s catch block emits an `error` event and rethrows without ever constructing a `TurnSummary` — `agent-session.ts` catches this and, if no `summary` was ever assigned (i.e. the error happened before the stream loop produced anything), nothing is persisted at all, meaning a pre-first-chunk failure (e.g. auth error) leaves no session turn record. Add a minimal `TurnSummary`-shaped catch in `submitPrompt` for this case so even a zero-content failed turn gets a `status: 'errored'` record with empty `messages` (needed for I2/§6.4 consistency and for the user to see "this turn failed" on `/resume`).

---

## 8. Tool/Event Design

### 8.1 Canonical tool-call lifecycle (new `src/engine/tool-lifecycle.ts`)

```ts
export type ToolCallStatus =
  | 'requested' | 'awaiting-approval' | 'approved' | 'denied'
  | 'running' | 'completed' | 'failed' | 'aborted';

export interface ToolCallRecord {
  id: string;              // stable, from chunk.toolCallId
  name: string;
  status: ToolCallStatus;
  argsSummary: string;     // bounded, tool-specific (see below)
  startedAt?: number;
  durationMs?: number;
  isError: boolean;
  resultPreview?: string;  // bounded (§9)
  resultTruncated: boolean;
}
```

This record type is what flows into `ToolCallSummary` (session) and into `HistoryStore`/dock rendering (TUI) — **one shape, two consumers**, replacing today's situation where `ToolResultInfo` (engine), `EditFileOutput`/`WriteFileOutput`/`RunCommandOutput` (per-tool, ad hoc), and `ConfirmationRequest.args` (untyped bag) each carry their own partial, inconsistent view of the same tool call.

`catalog.ts::toAISDKTools`'s wrapped `execute` is the single place all state transitions happen: `requested` (chunk received) → `awaiting-approval`/`approved` (skips if `sessionAllowlist` hit or policy is `'never'`) → `denied` (throws the existing `isInterrupted` error, unchanged) → `running` → `completed`/`failed`. Emit a new `AgentEvent` variant `tool-status` (extends `engine/events.ts::AgentEvent`) at each transition so the TUI can render live status without waiting for the terminal `tool-result`/`tool-error` event it gets today.

### 8.2 `argsSummary` per tool

Each `ToolDefinition` (types.ts) gains an optional `summarizeArgs?: (args) => string` (distinct from the existing `summarize?: (args, result?) => string`, which conflates args+result into one log line). Defaults: `edit_file`/`write_file` → the `path`; `run_command` → first 80 chars of `command`; others → JSON.stringify capped at 80 chars. This is what `ToolCallSummary.argsSummary` and `ToolCallRecord.argsSummary` use — never the raw `args` object.

### 8.3 Removing provider-shape leakage into the UI

`PermissionDock` currently reaches into `props.request.args as any` for `oldContent`/`newContent`/`content`/`command` — provider- and tool-specific shape leaking directly into TUI code. Replace `ConfirmationRequest.args: Record<string, unknown>` with a discriminated `ConfirmationPreview` (§9) that each tool constructs explicitly; `PermissionDock` switches on `preview.kind` instead of tool name string comparisons (`request.toolName === 'edit_file'`) and `any`-casts.

---

## 9. Diff/Confirmation Design

### 9.1 Bounded tool-result preview (new `src/tools/bounding.ts`, shared by §6 and §8)

```ts
export const RESULT_PREVIEW_MAX_CHARS = 4000;   // ~ a couple screens
export const RESULT_PREVIEW_MAX_LINES = 200;

export function boundResultText(text: string): { preview: string; truncated: boolean } { ... }
```
Used by: session persistence (`ToolCallSummary.resultPreview`), and by tool `execute()` return shapes — `EditFileOutput`/`WriteFileOutput`/`RunCommandOutput` stop returning `allLines`/`previewLines` containing the *entire* file; they return `boundResultText(fullContent)`'s output plus stats (`totalLines`, `bytesWritten`) which are cheap to compute without retaining the full text.

### 9.2 Confirmation preview contract (`tools/types.ts::ConfirmationRequest` redesign)

```ts
export type ConfirmationPreview =
  | { kind: 'edit'; path: string; statsOnly: { addedLines: number; removedLines: number }; smallPreviewDiffLines?: DiffLine[] /* only if under threshold, §9.3 */ }
  | { kind: 'write'; path: string; isNewFile: boolean; totalLines: number; bytesWritten: number; smallPreviewLines?: string[] }
  | { kind: 'command'; command: string /* capped to first N lines for display */; totalLines: number };

export interface ConfirmationRequest {
  toolName: string;
  displayName: string;
  promptTitle: string;
  preview: ConfirmationPreview;   // replaces `args: Record<string, unknown>`
  /** Opaque handle a full-review request can use to lazily compute the full diff/content. */
  reviewToken: string;
}
```

`getConfirmationRequest` for `edit_file`/`write_file` no longer reads full file content twice or builds `oldContent`/`newContent` strings for the dialog itself: it computes only line-count stats (cheap: count `\n` occurrences) plus a small preview (first/changed few lines) under the threshold in §9.3, and registers the full before/after under `reviewToken` in an in-memory, session-scoped, size-capped cache (`Map<reviewToken, {old:string,new:string}>`, evicted on decision) that `PermissionDock` can request from *only when* `isReviewing` becomes true.

### 9.3 Diff algorithm cap-and-fallback (`utils/diff.ts::computeLineDiff` rewrite)

```ts
export const DIFF_FULL_ALGORITHM_LINE_CAP = 2000;   // M+N under this: current LCS DP is fine and gives best-quality diffs

export function computeLineDiff(oldText: string, newText: string, contextLines = 3): DiffLine[] {
  const oldLines = ...; const newLines = ...;
  if (oldLines.length + newLines.length > DIFF_FULL_ALGORITHM_LINE_CAP) {
    return computeBoundedDiff(oldLines, newLines, contextLines); // O(N) hash-based, see below
  }
  return computeLcsDiff(oldLines, newLines, contextLines); // existing DP algorithm, unchanged, renamed
}
```
`computeBoundedDiff`: common-prefix/common-suffix trim (O(min(M,N))) to shrink the interesting middle region first (this alone resolves the common "small edit in a huge file" case to a tiny diff cheaply), then if the remaining middle region is still over a smaller inner cap, fall back to a line-hash multiset comparison (bucket lines by hash, report added/removed counts + first/last few changed lines) rather than a full alignment — explicitly *not* a best-effort LCS on a truncated window, to avoid an O(cap²) blowup at the boundary. Document the trade-off inline: bounded diff sacrifices perfect minimal-edit-script quality for O(N) worst case; this is acceptable because the UI only needs "what changed, roughly" for large files, with full content available via `reviewToken` for anyone who truly needs to see it (via `$EDITOR`/external diff, out of scope here) — never by rendering a giant TUI diff.

`PermissionDock`'s constructor stops calling `computeLineDiff` unconditionally. It only requests `smallPreviewDiffLines` (already present on the `ConfirmationPreview` when under threshold) at construction time; entering review mode (`f`) is what triggers, lazily, a bounded/full diff fetch (through the `reviewToken` cache) — satisfying I5.

### 9.4 Confirmation dialog stays compact regardless of payload size

`PermissionDock.render` default view renders `preview.statsOnly`/`totalLines`/`bytesWritten` plus at most `smallPreviewDiffLines`/`smallPreviewLines` (already capped upstream, §9.2) — no code path in the default (non-reviewing) render can be handed unbounded data, because unbounded data is never constructed until review mode requests it. Full review mode (`isReviewing`) paginates via the existing `reviewOffset`/`reviewWindowSize` windowing (already present, lines 206–217/244–255) — keep that windowing logic, just feed it from the lazily-fetched bounded/full diff instead of an eagerly-computed one.

---

## 10. TUI Component System

Keep the existing primitive set (`Box`, `Text`, `SelectList`, `ModalBox`) — the source shows a coherent, small primitive layer already (`tui/primitives/*.ts`, `tui/engine/Component.ts`); nothing here proves it's unsalvageable, so no framework swap. Scope for this plan is limited to the rendering-pipeline fix in §11, not a primitive redesign, since no finding in §2 implicates the primitive contract itself. (If a future audit finds primitive-level duplication, handle it as its own follow-up plan — out of scope here to avoid speculative abstraction per the coder-agent rules in §17 of the source brief.)

---

## 11. Rendering/Performance Design

### 11.1 Split immutable history from live content

New `tui/engine/HistoryLayoutCache.ts`:
```ts
interface CachedEntryLayout { entryId: string; width: number; physicalRows: PhysicalRow[]; rowCount: number; }
class HistoryLayoutCache {
  private cache = new Map<string, CachedEntryLayout>(); // key: `${entryId}:${width}`
  getOrCompute(entry: HistoryEntry, width: number): CachedEntryLayout { ... }
  invalidateWidth(width: number): void { ... } // called on resize
}
```
`HistoryEntry` objects from `HistoryStore` are immutable once pushed (already true — `push` never mutates an existing entry), so `(entryId, width)` is a valid, permanent cache key until resize.

### 11.2 `computeDocumentFrame` rewrite (`FrameBuffer.ts`)

Split the tree walk: committed history entries are laid out via `HistoryLayoutCache.getOrCompute` (O(1) amortized per entry after first render at a given width); only the live/active region (current `StreamingView`, `PromptInput`, any mounted dock/overlay — i.e. whatever `DocumentTree` currently marks as non-committed, confirmed against `DocumentTree.ts` in Phase 7) is laid out fresh each call. The viewport slice (existing `startIndex`/`endIndex` windowing logic, unchanged) is then built from `[cached history rows] + [fresh live rows]` instead of one monolithic `layoutDocument(tree, ...)` call over everything.

### 11.3 Invalidation rules

- Resize (`termWidth` changes): `HistoryLayoutCache.invalidateWidth` drops all entries for the old width (new width starts a fresh cache namespace — cheap, since old-width entries are simply garbage until evicted); `StateRenderer.clearPreviousFrameRecord()` (already exists) forces a full repaint on the next frame, unchanged.
- New history entry committed: no invalidation needed — it's simply not yet in the cache, computed lazily on first render.
- `HistoryStore.clearAll()` (used by `/clear`): cache is cleared alongside it (wire this call in `HistoryStore.clearAll` or its caller).

### 11.4 Complexity documentation (per-operation, added as doc comments at each function)

| Operation | Complexity |
|---|---|
| Keystroke → `PromptInput` re-render | O(input size) |
| Stream chunk → `StreamingView` update | O(chunk size) — live region only |
| Full frame render, steady state (no resize, no new history) | O(visible viewport) |
| Full frame render, one new history entry since last frame | O(new entry's line count) + O(viewport) |
| Resize | O(history) once (cache rebuild, amortized back to O(viewport) on subsequent frames) |
| `StateRenderer`'s terminal write (`ScreenBuffer.diff`) | O(terminal rows) — already true today, unchanged |

### 11.5 `HistoryStore` per-frame usage audit

Phase 8 must grep all call sites of `HistoryStore.getAllLines`/`getPrimaryScreenLines` and confirm none are reachable from the per-frame render path (`TerminalEngine`'s render trigger → `StateRenderer.render` → `FrameBuffer.computeDocumentFrame`); any found must be rerouted through `DocumentTree`/`HistoryLayoutCache` instead.

---

## 12. Error/Recovery Design

- **User abort** (`category: 'aborted'` in `errors/classifier.ts`, already correctly classified): §7's fix ensures a session turn is still recorded (`status: 'interrupted'`) even if the abort happens before any stream content arrives.
- **Model/provider failure**: already well-classified in `classifier.ts` (auth/forbidden/rate-limit/overload/context-length/etc.) — no change needed to classification; only the persistence gap in §7 is fixed so a pre-content failure still yields a recorded, inspectable turn.
- **Tool failure**: `tool-error` chunk path in `agent-runner.ts` already distinguishes this from provider errors (`ToolResultInfo.isError`); flows into `ToolCallRecord.status: 'failed'` (§8) instead of being flattened into the same `toolCalls` array shape as successes.
- **Persistence failure**: `saveSession`'s new atomic-write path (§6.2) must not swallow errors — if `renameSync` fails, the caller (`recordSessionTurn`) must propagate the failure up to `agent-session.ts::submitPrompt`, which must surface it to the TUI as a visible error badge (`formatErrorBadge`, already used in `app.ts` for other errors) rather than the current behavior of `saveSession`'s return value being ignored by `recordSessionTurn` — a failed save today is entirely silent.
- **Corrupted state**: quarantine path in §6.3, always diagnosed, never silently discarded.
- **Programmer error**: unchanged — TypeScript strictness plus the new Zod schema validation (§6.3) catches shape mismatches that would otherwise be `any`-cast programmer errors (e.g. today's `props.request.args as any` chain in `PermissionDock`, removed by §8.3/§9.2).
- **Terminal restoration**: out of scope for this pass (no finding in §2 implicates it) — Phase 9 must confirm `TerminalEngine`'s teardown path (mode restore on exit/error) is exercised by a test (§13) rather than assumed safe, since it's a hard invariant (I-list in the original brief) even though no bug was found in it during this review.

---

## 13. Test/Validation Matrix

All new/changed code ships with tests in the same phase (`bun test`, using `tests/` alongside existing `showcase.test.ts`).

**Sessions** (`tests/session/*.test.ts`, new)
- Zod schema validation accepts v2 docs, rejects malformed ones with the correct `reason`.
- `saveSession` → `loadSession` round-trip preserves all fields.
- v1→v2 migration: fixture v1 file with `rawMessages` present, and a second fixture with `rawMessages` absent (interrupted-turn case) — both migrate without throwing, second one gets `status:'interrupted'`, `messages: []`.
- Atomic save: simulate a write failure (mock `fsyncSync`/`renameSync` to throw mid-sequence) — assert original file untouched.
- Interrupted save: kill the write after temp-file write but before rename (test harness controls timing) — assert `filePath` still holds prior valid content.
- Malformed JSON / invalid schema: both quarantined, both surfaced via a non-null diagnostic return, not silently skipped.
- Partial turn / missing tool result / duplicate tool ID: fixture turns with these shapes — validator/migration must not throw, and (for duplicate tool ID) the loader must log a diagnostic.
- Resume correctness: session with 3 turns (one interrupted) round-trips through `AgentSession.resume` and `getHistory()` matches expected `ModelMessage[]` exactly, including tool-call/result messages for the completed turns.
- Large-output bounding: a `write_file` turn with a 5000-line file → session file size stays under a fixed byte budget (e.g. 20KB) regardless of file size.

**Agent execution** (`tests/engine/*.test.ts`, new — mock `streamText`/model)
- Plain response, single tool call, multiple sequential tool calls, tool failure, provider failure (each AI SDK error category from `classifier.ts`), stream error mid-turn, abort mid-turn, step-ceiling hit, correct `rawMessages`/`messages` reconstruction matching what was actually streamed.
- Pre-content failure (auth error before first chunk) still yields a recorded, non-empty-shaped session turn (`status:'errored'`).

**Tools** (`tests/tools/*.test.ts`, new)
- `edit_file`/`write_file`: approval, denial (interrupted error thrown with `isInterrupted`), execution failure (missing file, ambiguous `old_string` match), oversized output (`boundResultText` truncates correctly at the exact boundary), large files (10k+ lines) execute without retaining full content beyond `boundResultText`'s cap.
- `run_command`: large stdout (retains only `recentLines`/bounded output, matches existing `maxBufferLines` behavior — regression-protect what already works).

**Diff** (`tests/utils/diff.test.ts`, new)
- Insert/delete/replace/no-op cases against the existing LCS path (regression tests for current correct behavior — pin exact `DiffLine[]` output for small fixtures before touching the algorithm).
- Long lines, large file (>`DIFF_FULL_ALGORITHM_LINE_CAP`) routes to `computeBoundedDiff`, completes within a fixed time budget (e.g. <200ms for 50k+50k lines) and without allocating an M×N structure (assert via a memory-conscious fixture size that would OOM the old algorithm in CI if it were still running the DP path).
- Unicode, ANSI-embedded text lines pass through unmodified in `DiffLine.text` (rendering layer's job to handle width, not the diff algorithm's).
- Pathological input (e.g. all-identical lines, all-distinct lines) stays within the time/memory budget.

**TUI** (`tests/tui/*.test.ts`, new — as feasible without a real terminal; use `ScreenBuffer`/layout functions directly)
- Narrow/wide terminal width layout correctness (existing `cell-layout.ts` behavior — pin current output for fixtures before refactoring §11).
- `HistoryLayoutCache` returns identical rows for a cached vs. freshly-computed entry at the same width (correctness), and a call-count assertion that re-rendering the same frame twice without new history/resize does not recompute cached entries.
- Resize invalidates the cache and produces a correct full repaint (`StateRenderer.clearPreviousFrameRecord` interaction).
- `PermissionDock`: constructing it for a large edit does not call the full-diff path (assert via a spy/counter on `computeLineDiff`/`computeLcsDiff`) until `isReviewing` is toggled.
- Diff review pagination (`reviewOffset` windowing) unchanged behavior, regression-pinned.

**Performance** (`tests/perf/*.test.ts`, new, can be coarse-grained thresholds rather than micro-benchmarks)
- Session save/load time vs. turn count (linear, not superlinear).
- Frame-render cost for a fixed-size incremental change is flat across history sizes of 1k/10k/100k entries (within tolerance) — the concrete regression test for F7.
- Diff time for 50k-line inputs stays under budget — the concrete regression test for F6.

---

## 14. Migration Plan

- Schema versioning: `SessionDocumentV2.schemaVersion` field, `session/migrate.ts` as the single migration entry point, called transparently from `loadSession`.
- Legacy compatibility: v1 (unversioned, current on-disk format) migrates as described in §6.6; migration is lazy (on next load of that specific file), never a forced bulk pass over `~/.xd/sessions` on startup.
- Invalid-session handling: quarantine (§6.3), never silent deletion.
- Migration tests: covered in §13's session test list (v1-with-rawMessages and v1-without-rawMessages fixtures).
- Rollback/recovery: quarantined files are moved, not deleted — a user (or a future `/resume --recover` command, product decision, not required by this plan) can always inspect `~/.xd/sessions/<date>/.quarantine/`.
- No manual deletion of `~/.xd/sessions` is ever required for a user to keep working — every failure mode degrades to "this one session is quarantined," never "the whole store is unusable."

---

## 15. Phased Implementation Plan

Each phase: goal, prerequisites, exact files, tests, acceptance criteria. Buildable and testable at the end of every phase (`bun run format && bun test && bun run build`).

### Phase 0 — Characterization tests (no behavior change)
- **Goal**: lock down current correct behavior before touching anything.
- **Files**: add `tests/utils/diff.test.ts` (pin current `computeLineDiff` output on small fixtures), `tests/session/store.test.ts` (pin current `saveSession`/`loadSession`/`recordSessionTurn` round-trip behavior), `tests/tui/cell-layout.test.ts` (pin current `layoutDocument` output for a small fixed `DocumentTree`).
- **Acceptance**: `bun test` passes; these tests describe current behavior, including current bugs (e.g. duplication) — they exist to catch *unintended* regressions in later phases, not to assert current behavior is correct.

### Phase 1 — Session schema & atomic persistence (F1, F2, F3)
- **Files**: new `src/session/schema.ts`, `src/session/validate.ts`, `src/session/migrate.ts`; modify `src/session/store.ts` (`saveSession` atomic rewrite, `loadSession`/`listSessions` use validator+migration), `src/session/types.ts` (re-export new schema types, deprecate/remove old `SessionTurn`/`SessionData` once all call sites migrate).
- **Symbols**: `saveSession`, `loadSession`, `listSessions`, `recordSessionTurn` (store.ts); `SessionTurn`, `SessionData` (types.ts, replaced by `SessionTurnV2`/`SessionDocumentV2`).
- **Rules**: no call site outside `session/` should construct a raw `SessionData`/`SessionTurn` object literal directly — go through `createSession`/`recordSessionTurn`.
- **Tests**: full session test list from §13 (schema, atomic save, corruption, migration).
- **Acceptance**: Phase 0's pinned round-trip test is updated to reflect the new (bounded, versioned) shape; new tests from §13 pass; `bun test` green.

### Phase 2 — Canonical tool-call lifecycle & bounding (F1 cont'd, F5, F9's product-decision flagged not silently changed)
- **Files**: new `src/tools/bounding.ts`, new `src/engine/tool-lifecycle.ts`; modify `src/engine/types.ts` (`ToolResultInfo` usage trimmed/aligned with `ToolCallRecord`), `src/engine/events.ts` (add `tool-status` event), `src/tools/catalog.ts` (`toAISDKTools`'s execute wrapper emits lifecycle transitions), `src/tools/types.ts` (add `summarizeArgs?`).
- **Symbols**: `ToolCatalog.toAISDKTools`, `ConfirmationRequest`.
- **Tests**: tool tests from §13 (approval/denial/failure/oversized-output/large-files).
- **Acceptance**: `agent-session.ts::recordSessionTurn` call (Phase 1's `SessionTurnV2.toolCallSummaries`) is populated from `ToolCallRecord`s, not raw `ToolResultInfo.result`.

### Phase 3 — Confirmation preview contract & lazy full-content (F5, F6, F9)
- **Files**: modify `src/tools/types.ts` (`ConfirmationPreview` discriminated union replaces `ConfirmationRequest.args`), `src/tools/edit-file/index.ts` (`getConfirmationRequest` builds bounded preview + registers `reviewToken`), `src/tools/write-file/index.ts` (same), `src/tools/run-command/index.ts` (same, command capped for display), `src/utils/diff.ts` (`computeLineDiff` cap-and-fallback rewrite, add `computeBoundedDiff`), new `src/tools/review-cache.ts` (session-scoped `reviewToken` → full content map, capped size/TTL).
- **Symbols**: `ConfirmationRequest.args` (removed), `computeLineDiff` (rewritten, signature preserved), `PermissionDock` constructor (modify to consume `preview`/`reviewToken` instead of `args as any`).
- **Tests**: diff tests from §13 (cap boundary, large-file timing/memory), `PermissionDock` construction test (no full-diff call before review mode).
- **Acceptance**: I4, I5 hold (test-verified); confirmation dialog construction is O(preview), not O(file), for a 50k-line fixture.

### Phase 4 — Resume reconstruction fix (F4)
- **Files**: modify `src/engine/agent-session.ts` (constructor's turn-rehydration loop — single path from `turn.messages`, no `userPrompt`/`assistantText` fallback), `src/engine/agent-runner.ts` (pre-content-failure `TurnSummary` fix from §7).
- **Tests**: resume-correctness and pre-content-failure tests from §13.
- **Acceptance**: interrupted-turn resume round-trip test passes; no code path reconstructs messages from `userPrompt`/`assistantText` strings.

### Phase 5 — TUI history/live split & layout cache (F7, F8)
- **Files**: new `src/tui/engine/HistoryLayoutCache.ts`; modify `src/tui/engine/FrameBuffer.ts` (`computeDocumentFrame` split), `src/tui/engine/DocumentTree.ts` (expose which nodes are committed-history vs. live, if not already distinguishable — confirm during implementation and add the minimal marker needed), `src/tui/engine/HistoryStore.ts` (wire `clearAll` to cache invalidation, confirm `getAllLines`/`getPrimaryScreenLines` call sites per F8's audit and reroute any per-frame ones).
- **Symbols**: `computeDocumentFrame`, `layoutDocument` (cell-layout.ts, called only for the live region + cache misses).
- **Tests**: TUI/perf tests from §13 (cache correctness, flat-cost-across-history-size).
- **Acceptance**: I6 holds (perf test); Phase 0's `cell-layout.ts` pinned-output test still passes unchanged (visual output identical, only cost profile changes).

### Phase 6 — Error/recovery hardening (§12)
- **Files**: modify `src/session/store.ts` (`recordSessionTurn` propagates save failures instead of ignoring return value), `src/engine/agent-session.ts` (surface propagated save failures), `src/tui/app.ts` (render save-failure error badge via existing `formatErrorBadge`).
- **Tests**: persistence-failure test from §13 (save failure surfaces to caller, not silent).
- **Acceptance**: a forced `saveSession` failure in a test is visible in the TUI layer, not swallowed.

### Phase 7 — Terminal-restoration safety net (§12, no known bug, verification only)
- **Files**: `tests/tui/terminal-engine.test.ts` (new) exercising `TerminalEngine`'s teardown path under a simulated error/exit.
- **Acceptance**: test exists and passes; if it uncovers a real gap, fix minimally in `src/tui/engine/TerminalEngine.ts` with its own targeted test — do not expand scope speculatively.

### Phase 8 — Migration activation & full regression pass
- **Files**: none new; run the full `bun test` suite, `bun run build`, `bun run compile`.
- **Acceptance**: all release gates in §16 pass; manual smoke tests from §16 performed against a real terminal.

Order rationale: sessions first (Phase 1) because tool/confirmation bounding (Phase 2–3) needs the new `ToolCallSummary` shape to land in; resume fix (Phase 4) depends on Phase 1's schema; TUI perf (Phase 5) is independent of 1–4 and could be parallelized but is sequenced after for review bandwidth, not a hard dependency; error hardening (Phase 6) depends on Phase 1's atomic save existing to have a failure mode to propagate.

---

## 16. Validation / Release Gates

Hard gates, every phase:
```
bun run format
bun test
bun run build
bun run compile
```
(No separate typecheck script exists in `package.json` — `bun build`/`bun test` type-check as part of Bun's TS handling; if a dedicated `tsc --noEmit` is added to `package.json` during this work, add it to the gate list.)

Manual smoke tests (Phase 8, and after any phase touching the relevant area):
- New session creation and first turn.
- Multi-tool turn (2+ sequential tool calls in one turn).
- Abort mid-generation.
- Tool failure (e.g. `edit_file` on a nonexistent file).
- File edit approval (`allow_once`) and denial.
- Large file edit (>2000 lines) — confirm confirmation dialog stays compact, `f` review opens correctly, no visible stall.
- `f` full review on a large command.
- `/resume` on a session with a mix of complete and interrupted turns.
- Corrupted-session recovery: hand-corrupt a session file, confirm quarantine + diagnostic instead of crash/silent loss.
- Terminal resize during an active stream.
- Long session scrolling (100+ turns) — confirm responsiveness.
- Model switching via `/model` mid-session.

---

## 17. Definition of Done

- All findings in §2 have a corresponding fix landed in the phase listed in §15, with the test from §13 passing and green in CI (`bun test`).
- I1–I8 (§5) all have at least one automated regression test.
- No session file write can corrupt a previously-valid file (§6.2, test-verified).
- No diff or confirmation-dialog construction is O(file size) for the default (non-review) path; review mode is explicitly bounded/paginated (§9, test-verified).
- TUI per-frame cost for incremental changes is independent of total history size (§11, test-verified).
- `/resume` never silently drops tool-call history (§6.4/§8, test-verified).
- Existing users' session files load without manual intervention (§14).
- All four release gates (§16) pass, plus the manual smoke-test list.
- No new framework, database, or TUI library was introduced; the custom TUI and custom `streamText` orchestration were kept and hardened in place, per §7 and §10's reasoning.

