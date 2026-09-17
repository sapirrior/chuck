import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SessionData } from '../session/types.js';
import { saveSession } from '../session/store.js';
import { readCasBlob, verifyCasBlob, computeSha256 } from './cas.js';
import { globalMutationLockManager, MutationLockManager } from './lock.js';
import { computeWorkspaceHash } from './path.js';
import {
  deletePendingJournal,
  loadCheckpointManifest,
  loadPendingJournal,
  saveCheckpointManifest,
  savePendingJournal,
} from './store.js';
import {
  CHECKPOINT_SCHEMA_VERSION,
  type FileState,
  type RewindPendingJournal,
  type TurnCheckpoint,
} from './types.js';

export interface RewindOptions {
  session: SessionData;
  targetTurnId: string;
  workspaceRoot: string;
  lockManager?: MutationLockManager;
}

export type RewindResult =
  | {
      success: true;
      rewoundSession: SessionData;
      restoredFilesCount: number;
      discardedTurnsCount: number;
    }
  | {
      success: false;
      error: string;
      conflictPath?: string;
    };

function getFileStateOnDisk(absPath: string): FileState {
  if (!existsSync(absPath)) {
    return { kind: 'missing' };
  }
  const stat = statSync(absPath);
  const buf = readFileSync(absPath);
  const sha256 = computeSha256(buf);
  return {
    kind: 'file',
    sha256,
    mode: stat.mode,
    size: buf.length,
  };
}

function restoreFileStateToDisk(workspaceHash: string, absPath: string, state: FileState): void {
  if (state.kind === 'missing') {
    if (existsSync(absPath)) {
      unlinkSync(absPath);
    }
    return;
  }

  const dir = dirname(absPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const blobBytes = readCasBlob(workspaceHash, state.sha256);
  const tmpPath = join(dir, `.tmp-restore-${state.sha256.slice(0, 8)}-${randomUUID().slice(0, 8)}`);

  let fd: number | null = null;
  try {
    fd = openSync(tmpPath, 'w', state.mode || 0o644);
    writeSync(fd, blobBytes, 0, blobBytes.length);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;

    try {
      chmodSync(tmpPath, state.mode);
    } catch {}

    renameSync(tmpPath, absPath);
  } catch (err) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {}
    }
    if (existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath);
      } catch {}
    }
    throw err;
  }
}

/**
 * Executes a safe, transactional rewind of both conversation state and workspace files.
 */
export async function executeRewind(options: RewindOptions): Promise<RewindResult> {
  const { session, targetTurnId, workspaceRoot } = options;
  const lockManager = options.lockManager ?? globalMutationLockManager;
  const workspaceHash = computeWorkspaceHash(workspaceRoot);

  // 1. Identify target turn index
  const targetIndex = session.turns.findIndex((t) => t.id === targetTurnId);
  if (targetIndex === -1) {
    return {
      success: false,
      error: `Target turn ID not found in session: ${targetTurnId}`,
    };
  }

  const keptTurns = session.turns.slice(0, targetIndex);
  const discardedTurns = session.turns.slice(targetIndex);
  const discardedTurnIds = discardedTurns.map((t) => t.id);

  // 2. Load checkpoint manifest and validate fail-closed completeness
  const manifest = loadCheckpointManifest(workspaceHash, session.id);
  if (!manifest) {
    return {
      success: false,
      error: `Checkpoint manifest unavailable for session ${session.id}. Cannot safely rewind workspace files.`,
    };
  }

  const sidecarTurnMap = new Map<string, TurnCheckpoint>();
  for (const t of manifest.turns) {
    sidecarTurnMap.set(t.turnId, t);
  }

  for (const turn of discardedTurns) {
    const sidecarTurn = sidecarTurnMap.get(turn.id);
    if (!sidecarTurn || sidecarTurn.status !== 'committed') {
      return {
        success: false,
        error: `Turn ${turn.id} has no valid committed checkpoint. Full rewind is unavailable for uncheckpointed turns.`,
      };
    }
  }

  // 3. Collect discarded operations in reverse chronological order (newest -> oldest)
  // For each file, the latest post-state is the expected current state before rewind.
  // The oldest pre-state in the discarded range is the ultimate target state to restore.
  const reversedDiscardedTurns = [...discardedTurns].reverse();
  const fileOperationsMap = new Map<
    string,
    {
      relativePath: string;
      absolutePath: string;
      expectedPostState?: FileState;
      targetPreState: FileState;
    }
  >();

  for (const turn of reversedDiscardedTurns) {
    const sidecarTurn = sidecarTurnMap.get(turn.id);
    if (!sidecarTurn) continue;

    for (const fileCp of sidecarTurn.files) {
      if (!fileCp.mutationCommitted) continue;

      const relPath = fileCp.relativePath;
      const absPath = resolve(workspaceRoot, relPath);

      if (!fileOperationsMap.has(relPath)) {
        // The newest discarded turn sets the expected current state before rewind
        fileOperationsMap.set(relPath, {
          relativePath: relPath,
          absolutePath: absPath,
          expectedPostState: fileCp.post,
          targetPreState: fileCp.pre,
        });
      } else {
        // As we move backwards to older turns, the earliest turn's pre-state becomes the final target
        const existing = fileOperationsMap.get(relPath)!;
        existing.targetPreState = fileCp.pre;
      }
    }
  }

  const affectedFiles = Array.from(fileOperationsMap.values());
  const allAffectedAbsolutePaths = affectedFiles.map((f) => f.absolutePath);

  // 4. Acquire locks deterministically (lexicographical)
  const releaseLocks = await lockManager.acquireMany(allAffectedAbsolutePaths);

  try {
    // 5. Preflight verification
    for (const fileOp of affectedFiles) {
      // A. Verify target CAS blob exists if targetPreState is a file
      if (fileOp.targetPreState.kind === 'file') {
        if (!verifyCasBlob(workspaceHash, fileOp.targetPreState.sha256)) {
          return {
            success: false,
            error: `Missing or corrupt CAS blob for preimage of ${fileOp.relativePath} (${fileOp.targetPreState.sha256})`,
            conflictPath: fileOp.relativePath,
          };
        }
      }

      // B. Verify expected post state against current disk state
      const currentDiskState = getFileStateOnDisk(fileOp.absolutePath);
      if (fileOp.expectedPostState) {
        if (fileOp.expectedPostState.kind === 'missing') {
          if (currentDiskState.kind !== 'missing') {
            return {
              success: false,
              error: `Conflict detected for ${fileOp.relativePath}: expected file to be missing, but file exists on disk.`,
              conflictPath: fileOp.relativePath,
            };
          }
        } else if (fileOp.expectedPostState.kind === 'file') {
          if (
            currentDiskState.kind !== 'file' ||
            currentDiskState.sha256 !== fileOp.expectedPostState.sha256
          ) {
            return {
              success: false,
              error: `Conflict detected for ${fileOp.relativePath}: file has been modified externally after the checkpoint.`,
              conflictPath: fileOp.relativePath,
            };
          }
        }
      }
    }

    // 6. Write rewind transaction journal
    const rewindJournal: RewindPendingJournal = {
      kind: 'rewind',
      version: CHECKPOINT_SCHEMA_VERSION,
      workspaceHash,
      workspaceRoot,
      sessionId: session.id,
      targetTurnId,
      keptTurnIds: keptTurns.map((t) => t.id),
      discardedTurnIds,
      files: affectedFiles.map((f) => ({
        relativePath: f.relativePath,
        pre: f.targetPreState,
        post: f.expectedPostState,
      })),
      phase: 'files-pending',
    };

    await savePendingJournal(workspaceHash, session.id, rewindJournal);

    // 7. Restore files newest -> oldest
    const modifiedPaths: { path: string; originalPostState?: FileState }[] = [];
    try {
      for (const fileOp of affectedFiles) {
        restoreFileStateToDisk(workspaceHash, fileOp.absolutePath, fileOp.targetPreState);
        modifiedPaths.push({
          path: fileOp.absolutePath,
          originalPostState: fileOp.expectedPostState,
        });

        // Verify restoration
        const afterDiskState = getFileStateOnDisk(fileOp.absolutePath);
        if (fileOp.targetPreState.kind === 'missing') {
          if (afterDiskState.kind !== 'missing') {
            throw new Error(`Failed to remove file during rewind: ${fileOp.relativePath}`);
          }
        } else {
          if (
            afterDiskState.kind !== 'file' ||
            afterDiskState.sha256 !== fileOp.targetPreState.sha256
          ) {
            throw new Error(`Failed to restore file content for: ${fileOp.relativePath}`);
          }
        }
      }
    } catch (err: any) {
      // 8. Rollback filesystem changes on partial failure
      for (const mod of modifiedPaths) {
        if (mod.originalPostState) {
          try {
            restoreFileStateToDisk(workspaceHash, mod.path, mod.originalPostState);
          } catch {}
        }
      }
      await deletePendingJournal(workspaceHash, session.id);
      return {
        success: false,
        error: `Filesystem restoration failed and was rolled back: ${err.message || String(err)}`,
      };
    }

    rewindJournal.phase = 'files-restored';
    await savePendingJournal(workspaceHash, session.id, rewindJournal);

    // 9. Recompute session usage and truncate session turns
    const recalculatedUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };

    for (const t of keptTurns) {
      recalculatedUsage.inputTokens += t.usage.inputTokens;
      recalculatedUsage.outputTokens += t.usage.outputTokens;
      recalculatedUsage.totalTokens += t.usage.totalTokens;
      if (t.usage.reasoningTokens) {
        recalculatedUsage.reasoningTokens += t.usage.reasoningTokens;
      }
      if (t.usage.cacheReadTokens) {
        recalculatedUsage.cacheReadTokens += t.usage.cacheReadTokens;
      }
      if (t.usage.cacheWriteTokens) {
        recalculatedUsage.cacheWriteTokens += t.usage.cacheWriteTokens;
      }
    }

    session.turns = keptTurns;
    session.totalUsage = recalculatedUsage;
    session.updatedAt = new Date().toISOString();

    saveSession(session);

    // Update manifest: keep only turns that exist in keptTurns
    if (manifest) {
      manifest.turns = manifest.turns.filter((t) => keptTurns.some((kt) => kt.id === t.turnId));
      await saveCheckpointManifest(workspaceHash, session.id, manifest);
    }

    rewindJournal.phase = 'session-committed';
    await deletePendingJournal(workspaceHash, session.id);

    return {
      success: true,
      rewoundSession: session,
      restoredFilesCount: affectedFiles.length,
      discardedTurnsCount: discardedTurns.length,
    };
  } finally {
    releaseLocks();
  }
}

/**
 * Crash recovery on startup or before rewind.
 */
export async function recoverPendingCheckpoint(
  workspaceRoot: string,
  sessionId: string,
): Promise<void> {
  const workspaceHash = computeWorkspaceHash(workspaceRoot);
  const journal = loadPendingJournal(workspaceHash, sessionId);
  if (!journal) return;

  if (journal.kind === 'rewind') {
    // If files were restored but session wasn't committed, rollback files to postState if safe
    if (journal.phase === 'files-restored' || journal.phase === 'files-pending') {
      for (const file of journal.files) {
        if (file.post) {
          const absPath = resolve(workspaceRoot, file.relativePath);
          try {
            restoreFileStateToDisk(workspaceHash, absPath, file.post);
          } catch {}
        }
      }
    }
    await deletePendingJournal(workspaceHash, sessionId);
  } else {
    // Turn journal
    const committedFiles = journal.files.filter((f) => f.mutationCommitted);
    if (committedFiles.length === 0) {
      await deletePendingJournal(workspaceHash, sessionId);
    }
    // If turn has committed files, wait until either commitTurn is called or manual cleanup
  }
}
