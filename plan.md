Steward Direct File Mutation + Guaranteed Rewind Checkpointing
Implementation plan for the coding agent
This document is the implementation contract. Do not start by writing code. First trace every affected path and confirm the current checkout still matches the provided snapshot. The snippets below are pseudocode/data-shape sketches only, not copy-paste implementation code.
0. Goal and exact scope
Implement one coherent Steward update with these outcomes:
Replace the current non-destructive artifact/plan workflow with two direct workspace mutation tools:
write_file
edit_file
Remove write_artifact, edit_artifact, rename_artifact, delete_artifact, write_plan, rename_plan, and delete_plan, plus their related path-confinement and prompt/system-prompt language.
Add a durable pre-mutation checkpoint system for every tracked mutation tool call.
Keep checkpoint blobs content-addressed by SHA-256.
Support several file mutations in parallel during one model turn.
Make repeated mutations of the same file in one turn safe by serializing that path while allowing independent files to remain parallel.
Add /rewind with a dock UI consistent with Steward's existing TUI dock style and with the supplied screenshot.
Rewind both conversation state and files to the state immediately after the selected turn, i.e. discard the selected turn's successors and restore the file state that existed at the end of the selected turn.
Make rewind transactional and conflict-safe: never silently overwrite a file that changed outside the tracked mutation path after the checkpoint.
Do not change the TUI engine/layout layers just to implement this feature.
Do not introduce a new schema version for SessionDocument/SessionTurn; use a checkpoint sidecar because Steward explicitly treats session schema v1 as the canonical/final session schema.
Guarantee boundary
The guarantee is:
Every mutation made through Steward's write_file or edit_file path is rewindable from a durable checkpoint, provided checkpoint persistence itself succeeds and no external process changes the tracked files between the mutation and rewind.
Do not claim that /rewind can undo arbitrary manual edits, shell edits, another process changing a file, or filesystem metadata that cannot be faithfully restored. For a conflicting external change, the correct behavior is to stop the rewind before changing anything and report the conflict.
This boundary is deliberately stronger and more honest than saying "100% of all filesystem changes can always be reverted." It also mirrors the important limitation documented for modern AI coding tools: their rewind systems track their own edit/write paths rather than arbitrary shell/manual changes.
1. Research conclusions that should drive the implementation
1.1 Gemini CLI: checkpoint before mutation, shadow state, explicit restore
Gemini CLI's current checkpoint documentation describes an automatic checkpoint before AI file modification. It stores project state separately from the user's Git repository and stores conversation/checkpoint metadata locally. Its current /rewind flow lets the user choose an interaction and then choose whether to revert conversation, code, or both. The important design lesson for Steward is not the exact storage technology; it is the ordering: checkpoint first, mutate second, then anchor that checkpoint to a conversation interaction.
Gemini's current source uses a shadow Git repository for whole-project snapshots. That approach proves the concept but is heavier than necessary for Steward because Steward only needs to rewind its own tracked file mutations. It also has documented operational risks: a Gemini issue reported accidentally including the project's own .git directory in shadow snapshots, which caused very large history growth. Do not copy that architecture into Steward.
Sources to re-check during implementation:
Gemini CLI Checkpointing documentation.
Gemini CLI Rewind documentation.
Gemini CLI GitService source.
Gemini CLI checkpointing issues around shadow-repository correctness and .git capture.
1.2 Codex: file-oriented mutation boundaries and multi-file operations
Codex's current apply_patch design is deliberately file-oriented and can carry multiple Add/Update/Delete operations in one tool invocation. That is useful evidence for Steward's mutation layer: file paths and mutation records should be explicit, deterministic, and independent of the conversational UI.
Do not copy Codex's patch language into Steward. Steward already has a much simpler ToolDefinition contract. The relevant idea is that mutation orchestration should reason in terms of concrete file paths and pre/post states.
1.3 Claude Code: pre-edit file history and stable rewind anchors
The supplied Claude Code tool snapshot shows the important mechanics directly:
File Edit and File Write operate on concrete absolute file paths.
They validate before mutation.
They capture pre-edit file history before the write.
They intentionally keep asynchronous work outside the final read/check/write critical section.
They distinguish new files from existing files.
Their write/edit outputs preserve original content and change information for UI/history.
The provided snapshot also demonstrates a isConcurrencySafe() tool capability in the underlying Claude tool system. Even more importantly for Steward, the edit/write implementations explicitly avoid yielding between a final stale-state check and the actual write. That is the correct concurrency principle to preserve.
Do not copy Claude's LSP, permission, analytics, team-memory, or Ink/React implementation details; Steward does not have those subsystems. Borrow only the mutation semantics and sequencing.
Recent Claude Code issue reports are also useful warnings for this implementation: file-history/rewind systems can fail if snapshot anchors are missing, IDs collide, or session-history reconstruction is corrupted. Therefore Steward's checkpoint records must use Steward's existing unique turn IDs rather than inventing a second ambiguous message graph.
2. Steward-specific facts you MUST preserve
The supplied Steward snapshot establishes the following architecture.
2.1 Session storage is canonical and atomic
src/session/schema.ts currently has SESSION_SCHEMA_VERSION = 1. SessionTurn contains only id, timestamp, status, usage, and canonical messages. SessionDocument contains the ordered turns and session metadata.
src/session/store.ts already provides the persistence pattern to reuse:
sessions live under ~/.steward/sessions (or STEWARD_SESSIONS_DIR),
session JSON is written via temp file + fsync + atomic rename,
malformed sessions are validated/quarantined.
Do not add fileSnapshots to SessionTurn. The repo's src/session/important.txt explicitly treats schema v1 as the stable/final session contract. Put rewind checkpoint metadata in a separate sidecar store keyed by the existing sessionId + existing turnId.
2.2 AgentSession is the correct turn lifecycle boundary
src/engine/agent-session.ts currently:
appends the user message,
invokes runAgentTurn(...),
appends response messages,
accumulates usage,
records the session turn on success,
records interrupted/errored turns on failure.
The checkpoint tracker must therefore span the whole submitPrompt lifecycle, not only the success branch. A turn that mutates files and then errors/aborts still needs a durable checkpoint record so that the resulting turn remains rewindable.
2.3 Tool execution already has one shared context
src/tools/catalog.ts converts every ToolDefinition into AI SDK tools and passes the same ToolContext object into def.execute(...).
Extend ToolContext with the checkpoint service/turn tracker and a path/mutation lock service. Do not build a generic wrapper around the whole catalog that guesses whether arbitrary tools are mutating. The mutation tool itself knows exactly when it is about to write and must explicitly prepare its checkpoint.
2.4 TUI has a strict three-layer architecture
src/tui/Rules.txt is an explicit permanent contract.
Layer 0: engine/layout; do not edit for a new dock.
Layer 1: generic primitives.
Layer 2: components/app/docks.
The new RewindMenu.tsx belongs in src/tui/components/docks/ and should be built from existing SelectList, Box, Text, theme helpers, and the same dock mounting lifecycle used by SessionMenu, ModelPicker, and EffortPicker.
Do not add rewind-specific logic to src/tui/engine/, src/tui/layout/, or a new primitive unless an actually reusable, content-blind primitive is proven necessary.
3. Final storage architecture
Use a project-scoped checkpoint store under the same global Steward state root used for sessions.
Recommended layout:
~/.steward/
├── sessions/
│   └── <date>/<sessionId>.json
└── checkpoints/
    └── <workspaceHash>/
        ├── cas/
        │   └── <sha256>
        └── sessions/
            └── <sessionId>/
                ├── manifest.json
                └── pending.json      # exists only while a turn/rewind transaction is open
Why project-scoped CAS instead of one global ~/.steward/cas/<hash>
The user proposed a global CAS. Do not use a global cross-project content pool in v1. File snapshots can contain source code and secret-bearing files. Project-scoping reduces accidental cross-project retention/sharing and makes cleanup unambiguous.
The content address itself is still SHA-256, so duplicate snapshots inside one project are deduplicated.
Workspace hash
Compute a stable workspace identifier from the normalized trusted workspace root. Use the same normalized/real-path semantics as Steward's existing trust/path logic. The workspace hash is an opaque internal directory name, not a security boundary by itself.
CAS blob rules
A CAS entry contains raw file bytes only. File mode and other logical metadata belong in the manifest, not in the blob.
A blob is considered durable only after:
write to a temporary file inside the CAS directory,
fsync the file,
atomically rename to the final SHA-256 path,
optionally verify the resulting bytes hash to the expected SHA-256.
Existing blobs are immutable. Never overwrite a CAS blob.
4. Checkpoint manifest data model
Create a new checkpoint-sidecar module, separate from src/session/schema.ts.
Recommended modules:
src/checkpoint/
├── cas.ts
├── path.ts
├── lock.ts
├── store.ts
├── tracker.ts
├── rewind.ts
├── types.ts
└── index.ts
The exact filename split is implementation choice; the boundaries are not.
4.1 Checkpoint turn record
Use a sidecar record conceptually shaped like:
TurnCheckpoint {
  version: 1
  workspaceHash: string
  workspaceRoot: string
  sessionId: string
  turnId: string
  status: "pending" | "committed" | "abandoned"
  startedAt: string
  completedAt?: string
  files: FileCheckpoint[]
}
A FileCheckpoint should contain:
FileCheckpoint {
  relativePath: string
  pre: FileState
  post?: FileState
  mutationCommitted: boolean
}
Where FileState is conceptually:
FileState =
  | {
      kind: "missing"
    }
  | {
      kind: "file"
      sha256: string
      mode: number
      size: number
    }
Do not store the full source bytes in the manifest. sha256 points to the immutable CAS blob.
Byte-perfect meaning
Rewind restores:
file existence,
file bytes,
regular-file permission bits that Steward can represent.
Do not promise inode identity, creation time, ctime, or every filesystem-specific metadata field.
5. Stable turn identity: solve this before anything else
The checkpoint record must know the exact turnId of the conversation turn it belongs to.
Today recordSessionTurn() generates the turn UUID internally at record time. That is too late for a durable pre-mutation pending journal because the first mutation happens earlier.
Change the internal session-store API so AgentSession.submitPrompt() can allocate a turn UUID before runAgentTurn() starts and pass that existing ID into recordSessionTurn().
Do not change the serialized schema shape; only change the in-process API so the existing id field may be supplied by the caller.
Conceptually:
submitPrompt()
  -> allocate turnId
  -> checkpointTracker.beginTurn(turnId)
  -> runAgentTurn()
  -> recordSessionTurn(..., turnId)
  -> checkpointTracker.commitTurn(turnId)
The same turnId is then the canonical anchor for:
the SessionTurn,
the checkpoint sidecar,
the rewind menu item.
Do not create a second message-ID graph just for rewind.
6. Turn journal / crash-safety protocol
The phrase "before the tool runs" must mean durably before the actual file mutation.
6.1 Begin-turn journal
At turn start, create a pending.json journal containing at least:
session ID,
turn ID,
workspace hash/root,
start timestamp,
current canonical session turn count,
status pending.
Persist this atomically before any mutation tool is allowed to execute.
If the checkpoint store cannot be initialized or the pending journal cannot be written, mutation tools must fail closed. Do not silently fall back to uncheckpointed writes.
6.2 Prepare mutation
Every mutation tool must call:
checkpointTracker.prepareMutation(absPath)
after path validation but before changing bytes on disk.
The tracker must:
canonicalize the path;
acquire a per-path mutation lock;
check whether this path already has a checkpoint entry in the current turn;
if yes, reuse the existing pre-state;
if no, capture current state:
regular file -> read bytes + hash + mode + size, then ensure the CAS blob is durable;
nonexistent -> missing;
directory/special file -> reject mutation;
persist the new file entry into the pending turn journal;
only then return the mutation lease to the tool.
The snapshot is therefore durable before the first write.
6.3 Complete mutation
After the file mutation succeeds, the tool must call:
checkpointTracker.completeMutation(absPath)
This must:
read the actual resulting bytes from disk,
compute SHA-256,
capture resulting mode/size,
write/update the post state,
mark mutationCommitted = true,
persist the pending journal before returning success to the model.
If the write succeeds but the post-state cannot be checkpointed, treat the tool call as failed at the tool layer and attempt recovery from the pre-state. Do not report a successful untracked mutation.
6.4 End turn
At the end of submitPrompt, including success, interruption, and error:
ensure every committed mutation has a post-state;
drop entries that never actually mutated;
create/update the committed sidecar turn checkpoint;
delete/clear pending.json only after the committed checkpoint is durable and the SessionTurn with the same turnId has been durably saved;
if no files were mutated, do not create a file checkpoint record for that turn.
The ordering matters:
CAS preimage durable
    ↓
actual mutation
    ↓
CAS/post-state metadata durable
    ↓
SessionTurn durable
    ↓
checkpoint marked committed
    ↓
pending journal removed
7. Critical correction to the proposed rewind loop
The user's initial arrow says to restore discarded turns from oldest to newest.
That is incorrect for repeated edits to the same file.
Example:
Initial A0
Turn 1: A0 -> A1
Turn 2: A1 -> A2
Rewind to before Turn 2:
  restore Turn 2 pre-state = A1  ✅
Rewind to before Turn 1:
  must restore Turn 2 pre-state A1
  then restore Turn 1 pre-state A0
  final result = A0 ✅
Therefore the restore pass MUST process discarded turns in reverse chronological order: newest discarded turn first, oldest discarded turn last.
For each file, later pre-states undo newer mutations before earlier pre-states are applied.
Never implement the restore loop as oldest-to-newest.
8. Safe rewind semantics using post-state hashes
A preimage alone is not enough to guarantee safe restore.
Suppose Steward changed src/app.ts to hash B, then the user manually edits it to hash C, then runs /rewind. Blindly writing the old hash A would destroy the user's manual change.
Therefore every committed checkpoint stores both:
pre.sha256
post.sha256
Before a rewind modifies anything, it performs a complete preflight across all files involved in all discarded turns.
For each file:
current state == recorded post state ?
  yes -> safe to restore
  no  -> rewind conflict; modify nothing
For a file that was newly created by Steward:
pre = missing
post = hash B
current == B ?
  yes -> safe to delete on rewind
  no  -> conflict; do not delete
For an existing file:
pre = hash A
post = hash B
current == B ?
  yes -> safe to restore A
  no  -> conflict; abort before changing any file
This preflight is what makes the rewind operation deterministic and protects manual/external changes.
9. Transactional rewind algorithm
Create src/checkpoint/rewind.ts as the filesystem/session coordination layer. Keep it outside src/tui.
9.1 Input
The public rewind API should take:
session data
selected target turn ID/index
workspace root
Do not make the TUI itself perform filesystem restoration.
9.2 Determine discarded turns
Selected turn means:
keep the selected turn; discard every turn after it.
Compute:
keptTurns      = session.turns[0 .. targetIndex]
discardedTurns = session.turns[targetIndex + 1 .. end]
If the target is the final turn, this is a no-op and should not open a destructive confirmation.
9.3 Collect file operations
Load the committed checkpoint sidecars for discarded turns.
For every file entry, preserve:
relative path,
pre-state,
post-state,
source turn ID.
Deduplicate affected paths for the preflight set.
9.4 Acquire locks deterministically
Sort affected canonical paths lexicographically and acquire their per-path mutation locks in that exact order.
This prevents a deadlock between:
rewind acquiring A then B,
another mutation acquiring B then A.
The normal mutation layer uses one-path locking; rewind locks the complete set in sorted order.
9.5 Full preflight
Before touching any file:
verify every referenced CAS blob exists;
verify every referenced blob hash matches its file name/hash;
verify the session and checkpoint sidecars agree on session ID/turn ID/workspace hash;
read each current file state;
compare each current state to the effective post-state expected at the point immediately before rewind;
verify there are no unsupported file kinds.
If anything fails, unlock everything and return a structured conflict/error. No file and no session history may have changed.
9.6 Write rewind transaction journal
Before restoring files, atomically write:
pending.json = {
  kind: "rewind",
  sessionId,
  targetTurnId,
  keptTurnIds,
  discardedTurnIds,
  files: [preState + postState for every affected path],
  phase: "files-pending"
}
This journal must be durable before the first restore operation.
9.7 Restore files newest -> oldest discarded turn
For each discarded turn from newest to oldest, restore that turn's pre-state.
Do not restore a file twice when the older turn's pre-state is already equal to the state after the newer restore unless needed for the next state transition. A simple correct implementation may replay all relevant operations; optimize only after correctness tests are green.
Each single-file restore should itself be crash-safe:
existing pre-file
  -> write temp in same directory
  -> fsync temp
  -> set desired mode
  -> fsync temp again if needed
  -> atomic rename temp over destination
For pre = missing:
current tracked file
  -> remove it only after preflight proved current == recorded post
After every restore, verify the resulting file state equals the intended pre-state.
9.8 Failure rollback of the rewind itself
If a filesystem restore fails after some earlier files were already restored:
do not truncate the session;
use the transaction journal's post-states/CAS blobs to roll already-modified paths back to the exact state they had immediately before rewind;
verify those paths against the recorded post-states;
if rollback succeeds, delete the rewind journal and report failure with no visible state change;
if rollback cannot be proven, leave the durable journal in place and fail loudly into a recoverable state; never pretend the rewind completed.
9.9 Commit session truncation
Only after every filesystem state is correct:
set session.turns = keptTurns;
recalculate session.totalUsage from the kept turns rather than subtracting guessed values;
update updatedAt through the normal session-store save path;
save atomically using existing saveSession() semantics.
Then mark the rewind transaction phase as session-committed and finally remove the journal.
9.10 Reload and verify
After commit:
reload the session from disk using the normal validation path;
re-open/read all affected files and verify they match the selected target's resulting state;
only then return success to the TUI.
The TUI should switch/rebuild the active session using the existing switchToSession() pattern.
10. Crash recovery requirements
The feature must survive process death between any two persistence steps.
At Steward startup, or before opening /rewind, inspect the current workspace/session checkpoint directory for pending.json.
Support these states:
A. Turn journal exists, but no mutation was committed
Delete/close the pending journal safely and continue.
B. Turn journal exists, mutations are committed, SessionTurn with the same turnId exists
Finish the sidecar commit and remove the pending journal.
C. Turn journal exists, mutations are committed, but the SessionTurn does not exist
The process died mid-turn. The conversation never durably committed the turn. Safest recovery is to restore all affected files to their pre states, provided current files still equal recorded post-states. Then discard the incomplete turn journal.
If current files no longer equal the recorded post-states, do not overwrite them; quarantine the pending transaction and surface a recovery error.
D. Rewind journal exists
Use its phase plus exact pre/post state verification to decide whether the rewind is already complete or can be safely rolled back. Never infer the phase from timestamps.
The journal is a recovery protocol, not just debug output.
11. Path-safety policy for direct mutation tools
The current resolveSafePath() is specifically designed to confine paths inside .steward/artifacts or .steward/plans. It must not be repurposed for direct workspace editing.
Create a new direct-file path resolver with these rules:
Accept file_path from the tool.
Normalize/resolve relative paths against context.cwd.
Resolve the real path for existing targets.
For a new file, resolve the nearest existing parent and ensure that parent is within the trusted workspace.
Reject .. traversal that resolves outside the trusted workspace.
Reject directory targets.
Reject special files that are not ordinary regular files.
Do not follow a symlink outside the trusted workspace.
Prefer the existing workspace trust mechanism as the top-level authorization: TUIApp already gates execution on trusted folders.
Keep .git internals out of any special checkpoint scanning; Steward is not implementing a Git shadow repo.
Do not silently broaden mutation access to arbitrary absolute paths outside cwd in v1. That would remove an important part of the security boundary while this project has no general filesystem permission-rule subsystem.
12. write_file tool contract
Implement src/tools/write-file/index.ts using Steward's existing ToolDefinition pattern.
Recommended tool contract:
name: write_file
displayName: Write
icon: existing Steward write/edit style
parameters:
  file_path: string
  content: string
file_path may be absolute or cwd-relative; internally normalize it to one canonical absolute path.
Behavior:
Existing file
prepare checkpoint for the path;
read current bytes for snapshot/post-state checks;
atomically replace the full file content;
preserve the existing permission mode;
record post-state;
return a concise result describing update/create and path.
New file
prepare checkpoint records pre = missing;
create parent directory only after path validation;
atomically create the file;
use normal process umask/default creation mode, then record resulting mode;
return create result.
No-op write
If the supplied content is byte-identical to the existing content, do not treat it as a meaningful mutation. It may still return a normal success result, but it should not create a needless checkpoint entry.
Atomicity rule
Do not use a bare final writeFileSync(target, content) for critical workspace writes if this can be avoided. Write a temp file in the same directory, fsync it, then atomically rename it into place. Avoid async gaps between the final source-state check and the actual replacement.
13. edit_file tool contract
Use the supplied Claude Code snapshot as the semantic reference, but adapt it to Steward's much smaller tool framework.
Recommended parameters:
file_path: string
old_string: string
new_string: string
replace_all?: boolean
Behavior:
normalize/validate path;
acquire the per-file lock;
read current file bytes/content;
prepare checkpoint before mutation;
locate old_string;
if no match, return a structured tool error without mutating;
if more than one match and replace_all is false, return a structured error without mutating;
calculate the exact updated content in memory;
atomically write the updated content;
record post-state;
return a concise result.
New-file behavior should follow one of these exact choices, and the implementation must choose one consistently:
Preferred Steward rule: use write_file for new files and reject edit_file against a nonexistent target. This keeps the tool roles unambiguous.
Do not import Claude-specific readFileState, LSP notifications, analytics, permissions, or Notebook tooling. None of those subsystems exist in Steward.
14. Concurrency model: satisfy parallel mutation calls correctly
This requirement is mandatory because the user explicitly wants several edits/writes in parallel during one prompt cycle.
14.1 Independent paths stay parallel
Example:
write_file(A)  ────────────────┐
                              ├─ parallel
edit_file(B)  ────────────────┘
These should both be allowed to execute concurrently after their independent preimages have been durably captured.
14.2 Same path is serialized
Example:
edit_file(A) ─────┐
                  ├─ exclusive per-path lock
write_file(A) ────┘
The second operation must wait for the first to finish. Otherwise both calls can snapshot the same old bytes and race to overwrite each other, producing an incoherent result and an impossible rewind chain.
14.3 Turn-level snapshot de-duplication
The first mutation of A in a turn creates the pre-state. Later mutations of A in the same turn reuse it.
Do not make one checkpoint per tool call when the goal is turn-level rewind.
14.4 Store-level serialization
CAS writes and manifest JSON updates must be internally serialized so that two parallel file mutations cannot corrupt the checkpoint manifest.
Use a small async persistence queue/mutex in the checkpoint store rather than holding a file lock around the entire filesystem mutation.
14.5 Never hold a global checkpoint lock across model/file I/O
The only operation that needs broad locking is the final manifest update. Long-lived locks would destroy the parallelism requirement.
15. Replace the current tool registry cleanly
Update src/tools/index.ts and remove the legacy tool registrations and exports.
Current built-in tools include artifact and plan mutation tools. The new list should be conceptually:
read_file
find_files
search_text
list_dir
web_fetch
web_search
write_file
edit_file
No artifact/plan mutation tools should remain registered or exported.
Delete these legacy tool directories/files only after all references have been searched:
src/tools/write-artifact/
src/tools/edit-artifact/
src/tools/rename-artifact/
src/tools/delete-artifact/
src/tools/write-plan/
src/tools/rename-plan/
src/tools/delete-plan/
src/tools/safe-paths.ts   # only if no remaining user of it after the migration
Also remove any now-dead types/exports/imports associated exclusively with them.
Before deleting anything, run a repository-wide search for:
write_artifact
edit_artifact
rename_artifact
delete_artifact
write_plan
rename_plan
delete_plan
resolveSafePath
ArtifactKind
.steward/artifacts
.steward/plans
Delete every obsolete reference, including prompt text, docs, tests, UI strings, and exports.
16. Rewrite the system prompt around direct mutation
src/engine/system-prompt.ts must stop telling the model that host files are never modified.
Replace the old conceptual rules:
never modify host project files directly
write_artifact/edit_artifact
write_plan
artifact lifecycle
plan lifecycle
with a direct but safe workflow:
investigate -> read/search -> edit/write directly -> checkpoint automatically -> verify
The prompt should explain:
write_file creates/overwrites a file in the trusted workspace;
edit_file makes a targeted string replacement in a trusted workspace file;
all Steward mutations are automatically checkpointed before mutation;
/rewind can restore a prior conversation+workspace state for Steward-tracked changes;
use edit_file for targeted changes and write_file for full replacement/new files;
do not invent tool names or parameters;
independent tool calls may be issued in parallel;
same-file changes will be serialized by the runtime;
prefer reading/investigating before editing to preserve correctness.
Keep the existing system-prompt section structure unless there is a compelling current reason to change it, because tests/system-prompt.test.ts checks those sections.
Add /rewind to the <slash_commands> section.
Update examples that currently teach artifact/plan workflows.
17. ToolContext changes
Extend src/tools/types.ts from its current small context:
cwd
abortSignal
to also provide the current turn's checkpoint tracker and any mutation-lock service needed by the tools.
Prefer a narrow interface such as:
checkpointTracker: MutationCheckpointTracker
mutationLocks: MutationLockManager
Keep the checkpoint API semantic, not filesystem-specific. The tool should ask to checkpoint a path; it should not know where CAS blobs live.
Tests that directly construct ToolContext must be updated with a test implementation or fixture.
18. AgentSession integration, exact order
Update src/engine/agent-session.ts with this lifecycle:
submitPrompt(prompt)
  1. reject concurrent submitPrompt
  2. create turnId
  3. begin checkpoint turn journal
  4. append user message
  5. call runAgentTurn with ToolContext carrying this turn tracker
  6. append response messages
  7. accumulate usage
  8. record SessionTurn using the SAME turnId
  9. commit checkpoint sidecar
 10. remove pending turn journal
 11. return summary
Error/abort path:
catch
  1. record interrupted/errored SessionTurn using SAME turnId
  2. finalize checkpoint sidecar if mutations completed
  3. remove pending journal only after both are durable
  4. rethrow
finally should only clear generation state/abort controller after the persistence protocol has completed.
Do not let finally remove the pending journal prematurely.
19. Rewind command
Add:
src/commands/rewind/index.ts
The command should follow the same small command contract as resumeCommand and renameCommand.
Recommended behavior:
/rewind with no argument returns data: { showRewind: true }.
If no committed turns exist, return a concise message instead of opening an empty destructive UI.
Reject rewind while context.session.isBusy.
Do not perform filesystem restoration inside the command module.
Do not require a target index as a CLI argument in v1; the dock is the primary interaction.
Register the command in src/commands/registry.ts and update the built-in slash-command list.
20. Rewind menu UI
Create:
src/tui/components/docks/RewindMenu.tsx
The supplied screenshot is the visual reference. Target the same overall information hierarchy:
Rewind

Restore the code and/or conversation to the point before...

> <user prompt summary>
    <file-change summary>

  <user prompt summary>
    <file-change summary>

  <current>
The screenshot shows:
a dock-style heading,
an explanatory subtitle/instruction line,
selected prompt highlighted with the normal selection pointer/color,
a secondary line describing whether code changed,
a current marker at the bottom/current point.
Do not clone the screenshot's typography mechanically. Use Steward's existing SelectList, renderModalBox, theme colors, pointer figure, and formatting conventions so it looks native to Steward.
Recommended item data
Each menu entry should derive from the existing SessionTurn plus checkpoint-sidecar lookup:
RewindItem {
  turnId
  turnIndex
  promptText
  hasCodeChanges
  changedFileCount
  isCurrent
}
The prompt text must be taken from the turn's existing canonical messages rather than introducing a new canonical prompt field.
Important semantic wording
The menu should say "rewind to this point" or "restore to the state after this turn" rather than implying the selected turn itself will disappear. This avoids off-by-one ambiguity.
If the product copy is intentionally modeled on the screenshot's "before" language, make the selection semantics explicit in the implementation/tests:
select Turn N => keep Turn N, discard turns N+1 ... end
No second modal in v1
Keep v1 simple: selecting a turn means rewind conversation + Steward-tracked code changes together.
Gemini demonstrates that separate "conversation only" and "code only" actions can be useful, but adding those modes is not required for this update and would substantially expand the state machine. Add them only after the combined rewind path is proven correct.
21. Integrate the dock in src/tui/app.ts
Follow the existing modal lifecycle exactly:
if active modal -> close it
unmount prompt input
unmount status bar
mount RewindMenu as kind: 'dock'
mount status bar
When the item is selected:
close the modal input surface;
set busy/status state if needed;
call the domain-level executeRewind(...) function;
load the resulting canonical session document;
call the existing switchToSession(...) path or refactor a small reusable private helper around it;
rehydrate history through rehydrateSessionHistory(...);
restore prompt/status mounts.
Do not manually reproduce the history rendering logic in RewindMenu.
Do not modify Layer 0 for this.
22. Rehydration correctness
The current AgentSession resume path rebuilds its model message history by iterating turn.messages.
The current TUI switch path also calls rehydrateSessionHistory(selected) and rebuilds the engine presentation from the canonical session turns.
Therefore, after rewind:
session.turns = kept turns only
      ↓
AgentSession.resume(rewoundSession)
      ↓
messages rebuilt from kept turn.messages
      ↓
rehydrateSessionHistory(rewoundSession)
      ↓
TUI rebuilt from canonical state
Do not mutate the in-memory messages array manually from the TUI. Recreate the AgentSession from the rewound persisted session, exactly as session resume already does.
23. Usage recalculation
The current store accumulates session.totalUsage when turns are recorded. Rewind cannot safely subtract one guessed amount if the stored values are optional/partial.
After truncation, recompute:
sum(turn.usage.inputTokens)
+ sum(turn.usage.outputTokens)
+ sum(turn.usage.totalTokens)
+ sum(optional reasoning/cache metrics where present)
Use the same field-presence semantics already used elsewhere in Steward.
Then persist the recalculated totalUsage atomically.
Add a dedicated unit test for a session with three turns where rewinding from turn 3 to turn 1 leaves turn 1's usage only.
24. clear and other session transitions
/clear creates a brand-new in-memory session. Do not make it delete checkpoint data immediately because an older session on disk may still be resumable and therefore legitimately rewindable.
Checkpoint data should be garbage-collected separately based on reachability from saved sessions and checkpoint manifests. A simple v1 implementation may retain it indefinitely for correctness; cleanup can be a later feature.
/resume must work with checkpoint sidecars transparently.
Resuming a session should load/validate its session JSON and lazily load checkpoint metadata when /rewind is opened.
25. Validation and quarantine for checkpoint sidecars
Create a small Zod schema for the checkpoint sidecar, analogous to the session validation layer.
Reject/quarantine:
invalid JSON,
wrong checkpoint schema version,
session ID mismatch,
workspace hash mismatch,
malformed relative paths,
missing CAS blobs,
hash/path mismatches,
impossible state transitions such as mutationCommitted = true with no post state.
Do not silently ignore invalid checkpoint data. A broken rewind record should be surfaced to the user or quarantined with enough diagnostics to recover the active session without corrupting it.
26. Tests to add before declaring the feature complete
The test suite currently uses Bun tests and already has TUI golden snapshots. Extend that style; do not create an unrelated test framework.
26.1 CAS tests
Create tests for:
new blob is written under its SHA-256;
same bytes deduplicate to the same blob;
corrupted blob is detected;
blob write is atomic;
file mode is preserved in manifest metadata.
26.2 Direct file path tests
Test:
relative path inside workspace -> allowed;
absolute path inside workspace -> allowed;
../outside -> rejected;
symlink escaping workspace -> rejected;
directory target -> rejected;
special/non-regular target -> rejected;
parent directory for a new file can be created only after safety checks.
Existing trust.test.ts already tests folder normalization and symlinked paths; reuse its conventions where appropriate.
26.3 write_file tests
Test:
create new file;
overwrite existing file;
no-op write does not create a meaningful checkpoint;
pre-state captured before write;
post-state captured after write;
failed write does not falsely report a successful mutation;
existing mode preserved;
concurrent writes to different files both succeed;
concurrent writes to the same file serialize.
26.4 edit_file tests
Test:
one match replaced;
zero matches -> no mutation;
multiple matches with replace_all=false -> no mutation;
multiple matches with replace_all=true -> all replaced;
nonexistent file rejected (if the implementation chooses the preferred Steward semantics of creation via write_file);
same-file parallel edits serialize;
checkpoint pre-state is the state before the first edit in the turn.
26.5 Turn checkpoint tests
Test a model turn that:
mutates two different files in parallel;
mutates the same file twice sequentially;
mutates the same file from concurrent tool calls;
mutates one file and then errors;
mutates one file and is interrupted;
performs no mutation.
The sidecar must have at most one preimage per path per turn and must contain post-state for every committed mutation.
26.6 Rewind correctness tests
These are mandatory.
Test A: one file, one turn
A0
Turn1: A0 -> A1
rewind to initial state
expected: A0
Test B: one file, two turns
A0
Turn1: A0 -> A1
Turn2: A1 -> A2
rewind to Turn1
expected: A1
Test C: one file, two discarded turns
A0
Turn1: A0 -> A1
Turn2: A1 -> A2
Turn3: A2 -> A3
rewind to initial turn
expected: A0
This specifically catches the incorrect oldest-to-newest restore order.
Test D: several files in parallel
A0, B0, C0
one turn mutates A/B/C
rewind
expected: A0, B0, C0
Test E: create then rewind
file X does not exist
Turn1 creates X
rewind
expected: X does not exist
Test F: conflict safety
Turn1 changes A0 -> A1
external process changes A1 -> A_external
rewind
expected:
  no file changes
  session history unchanged
  structured conflict returned
Test G: failed rewind atomicity
Create several file changes and inject a failure halfway through restore. Verify:
session remains unchanged,
all already-touched files are rolled back to their pre-rewind state,
pending journal remains only when recovery is truly unresolved.
Test H: crash recovery
Simulate a process death at each phase of the pending protocol and verify startup returns to a coherent state.
Test I: usage rebuild
Rewind a four-turn session to turn one and verify all total-usage fields equal the sum of kept turns.
26.7 TUI golden tests
Follow the existing headless-golden pattern in tests/tui/engine-snapshots.test.ts.
Add:
tests/tui/goldens/dock-rewind-menu.txt
At minimum test:
80-column rendering,
120-column rendering,
selected item,
an item with no code changes,
an item with code changes and file count,
current marker,
long prompt truncation/wrapping,
empty/no-rewind state if represented by the same dock.
Do not edit the engine or add manual row offsets.
27. System prompt tests
Update tests/system-prompt.test.ts so it still verifies all existing required section tags, but now also verifies:
Must contain:
write_file
edit_file
/rewind
language describing automatic checkpoints/rewind
Must not contain:
write_artifact
edit_artifact
rename_artifact
delete_artifact
write_plan
rename_plan
delete_plan
.steward/artifacts
.steward/plans
claims that host files cannot be directly modified
Keep the existing checks for user-defined rules and additional instructions.
28. Documentation/package metadata cleanup
After the code paths are migrated:
Update README.md language that currently describes Steward as producing only safe code proposals/artifacts.
Update package.json description if it still claims that nothing lands until approval.
Update any examples/documentation that reference .steward/artifacts or .steward/plans.
Update slash-command documentation to include /rewind.
Leave .agents/ untouched; Steward's rules explicitly mark it as human-managed.
Do not modify .agents/ to make this feature easier to implement.
29. File-by-file implementation sequence
The coding agent should follow this exact order to minimize half-migrated states.
Phase 1 — inventory
Search the entire repo for all artifact/plan symbols and all existing session/TUI command references.
Do not edit yet.
Phase 2 — checkpoint core
Create and test:
src/checkpoint/types.ts
src/checkpoint/cas.ts
src/checkpoint/path.ts
src/checkpoint/lock.ts
src/checkpoint/store.ts
src/checkpoint/tracker.ts
src/checkpoint/rewind.ts
src/checkpoint/index.ts
Build the core entirely against temporary directories in tests.
Phase 3 — session turn-ID plumbing
Update recordSessionTurn/AgentSession so the turn UUID exists before tool execution but remains serialized in the same SessionTurn.id field.
Add tests first for caller-supplied IDs and backward compatibility with the existing API where practical.
Phase 4 — ToolContext and mutation tools
Add checkpoint/lock context and implement write_file + edit_file.
Test these without the AI model.
Phase 5 — registry migration
Add the new tools to the catalog and remove the old artifact/plan registrations/exports.
Phase 6 — AgentSession wiring
Make every submitPrompt turn create a tracker and pass it through the same ToolContext used by TUIApp.
Make success + interruption + error all finalize checkpoint state.
Phase 7 — system prompt
Rewrite tool/workflow/artifact/plan instructions and update tests.
Phase 8 — rewind domain layer
Implement sidecar loading, reverse-order restore, conflict preflight, transactional journal, session truncation, usage recomputation, and crash recovery.
Phase 9 — command and dock
Add /rewind, RewindMenu, app integration, and goldens.
Phase 10 — delete legacy code/docs
Only after the new path is working, delete artifact/plan tool directories and dead helpers.
Phase 11 — full verification
Run the exact verification matrix in Section 31.
30. Important non-obvious edge cases
Same file changes in one turn
Capture one preimage only. Each mutation gets its own post-state update; final committed turn state should reflect the state at end-of-turn.
Parallel first mutations to two files
Both preimages may be captured concurrently. Manifest persistence may serialize briefly; file work itself stays parallel.
Parallel same-file mutations
Serialize with the per-path mutex. Never let two writes to one path execute concurrently.
A mutation creates then rewrites a file in one turn
pre = missing; post = final content hash. One rewind deletes the file.
A mutation overwrites a file multiple times in one turn
pre = original state; post = final state. One rewind restores the original state.
Turn errors after mutation
The turn still gets a canonical status: errored/interrupted SessionTurn, and its checkpoint remains rewindable.
Empty/failed tool call
Do not create a checkpoint record for a tool call that never actually mutates the file.
User changes file after Steward mutation
Rewind must refuse to overwrite because current hash != checkpoint post hash.
CAS missing/corrupt
Rewind must fail before changing any file.
Session sidecar missing
The session remains resumable; /rewind should say that no restorable checkpoint data exists instead of guessing.
Rewind while agent is running
Reject/disable it. The existing /clear command already uses session.isBusy as the model for command safety.
Rewind final turn
No-op; do not truncate or modify files.
Rewind first turn
Keep that turn and restore files to its end state if later turns are discarded.
Current session has no turns
Do not open the rewind dock.
31. Verification commands
Run these after implementation, in this order:
bun test
Then:
bun run lint:boundaries
Then:
bun run format
Then:
bun run build
If any command fails, fix the implementation rather than weakening the test unless the test is demonstrably asserting an obsolete contract that this plan explicitly replaces.
For TUI visual changes, follow Steward's own process:
UPDATE_GOLDENS=0 bun test
Only when the output is correct:
UPDATE_GOLDENS=1 bun test
Then inspect the golden diff manually.
32. Acceptance checklist
The implementation is not complete until every item is true.
Mutation
write_file can create a file.
write_file can overwrite a file.
edit_file performs safe targeted replacement.
all direct mutation paths go through checkpoint tracking.
no tracked mutation can occur when checkpoint persistence is unavailable.
path traversal outside trusted cwd is rejected.
same-file mutation calls serialize.
different-file mutation calls remain parallel.
Checkpoints
preimage is durable before first mutation.
CAS blobs use SHA-256.
blobs are immutable and deduplicated.
post-state is durable after mutation.
one preimage per file per turn.
turn checkpoint is anchored by the canonical SessionTurn ID.
interrupted/errored turns retain valid checkpoint state.
Rewind
/rewind exists.
rewind menu lists actual session turns.
selected turn is preserved; successors are discarded.
discarded turns are restored newest-to-oldest.
current post-state hashes are checked before any restore.
any conflict aborts before file changes.
restore is transactionally recoverable after partial failure.
session JSON is truncated atomically only after filesystem restore succeeds.
total usage is recomputed from kept turns.
TUI is rebuilt from the canonical rewound session.
crash recovery is deterministic.
Removal
no legacy artifact/plan tool remains registered.
no legacy artifact/plan tool remains exported.
no system prompt references legacy tool names.
no .steward/artifacts or .steward/plans workflow remains in user-facing docs.
dead helper code is removed only after repository-wide reference search.
TUI
RewindMenu is Layer 2 only.
no Layer 0 engine/layout changes are required.
golden tests exist for 80 and 120 columns.
selected/current/no-code-change/code-change states render coherently.
33. Definition of "done"
A coding agent should consider this feature done only when this scenario works from a clean test workspace:
Turn 1
  user: "Create A and B"
  tool calls in parallel:
    write_file(A)
    write_file(B)

Turn 2
  user: "Edit A twice and replace B"
  tool calls:
    edit_file(A)
    edit_file(A)       # serialized internally
    write_file(B)

Turn 3
  user: "Make another change"
  tool call:
    edit_file(A)

/rewind
  choose Turn 1

Result:
  - conversation contains only Turn 1
  - A and B exactly match their Turn-1 end states
  - usage equals Turn-1 usage
  - TUI is rebuilt from the Turn-1 canonical session
  - all discarded turns are absent from the active session
  - no legacy artifact/plan tool appears in the model tool list
Then repeat the same scenario after manually modifying one affected file between the last turn and /rewind.
Expected result:
rewind is rejected as a conflict
no file is overwritten
no session history is truncated
That last test is essential. A rewind system that silently destroys a user's external change is not a safe rewind system.
34. Research-to-design summary
The final architecture deliberately combines the useful parts of the researched tools without copying their weaknesses:
Gemini lesson
  checkpoint before mutation
  + conversation anchor
  - do NOT copy whole-project shadow Git

Claude lesson
  pre-edit file history
  + stable message/turn anchoring
  + avoid async gaps around final write
  - do NOT copy Claude-specific LSP/permission/Ink internals

Codex lesson
  explicit file-oriented mutation operations
  + multi-file mutation awareness
  - do NOT introduce a new patch language unnecessarily

Steward-native design
  SessionTurn remains canonical and unchanged
  + checkpoint sidecar keyed by existing turn ID
  + content-addressed CAS
  + per-path locks
  + post-state conflict checks
  + transactional rewind
  + custom Layer-2 dock
The most important implementation rules are therefore:
1. Never mutate before the preimage is durably checkpointed.
2. Never mutate the same path concurrently.
3. Never rewind a path whose current state no longer matches the recorded post-state.
4. Restore discarded turns newest-to-oldest.
5. Never truncate conversation history before filesystem restore is complete.
6. Never add rewind fields to SessionTurn; keep the canonical session schema stable.
7. Never make the TUI engine responsible for checkpoint or restore logic.
35. Source basis from the provided snapshots
Use these exact Steward files as the local source of truth while implementing:
src/engine/agent-session.ts
src/session/schema.ts
src/session/store.ts
src/session/types.ts
src/session/validate.ts
src/session/helpers.ts
src/tools/catalog.ts
src/tools/index.ts
src/tools/types.ts
src/tools/read-file/index.ts
src/tui/app.ts
src/tui/components/docks/SessionMenu.tsx
src/tui/primitives/widgets/SelectList.ts
src/tui/Rules.txt
tests/system-prompt.test.ts
tests/tui/engine-snapshots.test.ts
tests/trust.test.ts
package.json
Use the supplied Claude Code snapshot specifically for:
FileEditTool/FileEditTool.ts
FileWriteTool/FileWriteTool.ts
FileEditTool/UI.tsx
FileWriteTool/UI.tsx
The implementation should preserve Steward's own naming, error handling, test style, and TUI architecture rather than copying foreign framework assumptions.
Final instruction to the coding agent
Do not treat the user's original arrow diagram as authoritative where it conflicts with this repository's invariants or with reversible filesystem semantics.
In particular, the original diagram has three deliberate changes in this plan:
A. fileSnapshots belong in a checkpoint sidecar, not SessionTurn.
B. restore discarded turns newest -> oldest, not oldest -> newest.
C. rewind must verify post-state hashes and use a transaction journal before changing files.
Those three corrections are mandatory for the claimed safety level.
Before making any source edit, re-run a repository-wide reference search and re-open the exact current files in the checkout. The provided steward.wit.xml is the architecture baseline, not permission to assume the checkout has not changed since the snapshot.
