import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { writeCasBlob } from './cas.js';
import { globalMutationLockManager, MutationLockManager } from './lock.js';
import { computeWorkspaceHash, resolveDirectMutationPath } from './path.js';
import { commitTurnCheckpoint, deletePendingJournal, savePendingJournal } from './store.js';
import {
  CHECKPOINT_SCHEMA_VERSION,
  type FileCheckpoint,
  type FileState,
  type TurnCheckpoint,
  type TurnPendingJournal,
} from './types.js';

export interface PrepareMutationResult {
  preState: FileState;
  releaseLock: () => void;
}

export class MutationCheckpointTracker {
  private workspaceRoot: string;
  private workspaceHash: string;
  private sessionId: string;
  private activeTurnId: string | null = null;
  private turnStartedAt: string | null = null;
  private turnCount: number = 0;
  private files: Map<string, FileCheckpoint> = new Map();
  private lockManager: MutationLockManager;

  constructor(options: {
    workspaceRoot: string;
    sessionId: string;
    lockManager?: MutationLockManager;
  }) {
    this.workspaceRoot = options.workspaceRoot;
    this.workspaceHash = computeWorkspaceHash(options.workspaceRoot);
    this.sessionId = options.sessionId;
    this.lockManager = options.lockManager ?? globalMutationLockManager;
  }

  public get currentTurnId(): string | null {
    return this.activeTurnId;
  }

  /**
   * Initializes a turn journal before any tool executes.
   */
  public async beginTurn(turnId: string, turnCount = 0): Promise<void> {
    this.activeTurnId = turnId;
    this.turnStartedAt = new Date().toISOString();
    this.turnCount = turnCount;
    this.files.clear();

    const journal: TurnPendingJournal = {
      kind: 'turn',
      version: CHECKPOINT_SCHEMA_VERSION,
      workspaceHash: this.workspaceHash,
      workspaceRoot: this.workspaceRoot,
      sessionId: this.sessionId,
      turnId,
      status: 'pending',
      startedAt: this.turnStartedAt,
      turnCount,
      files: [],
    };

    await savePendingJournal(this.workspaceHash, this.sessionId, journal);
  }

  /**
   * Prepares a mutation for a given file path.
   * Acquires the per-path lock, captures pre-state (and persists CAS preimage),
   * and saves the pending turn journal before returning the lock lease.
   */
  public async prepareMutation(absoluteOrRelativePath: string): Promise<PrepareMutationResult> {
    if (!this.activeTurnId) {
      throw new Error('Cannot prepare mutation outside an active turn checkpoint tracker.');
    }

    const resolved = resolveDirectMutationPath(this.workspaceRoot, absoluteOrRelativePath);
    const canonicalPath = resolved.absolutePath;
    const relPath = resolved.relativePath;

    // 1. Acquire per-path lock
    const releaseLock = await this.lockManager.acquire(canonicalPath);

    try {
      // 2. Check if already tracked in this turn
      const existing = this.files.get(relPath);
      if (existing) {
        return {
          preState: existing.pre,
          releaseLock,
        };
      }

      // 3. Capture preimage
      let preState: FileState;
      if (existsSync(canonicalPath)) {
        const lstat = lstatSync(canonicalPath);
        if (lstat.isDirectory()) {
          throw new Error(`Target path is a directory: ${canonicalPath}`);
        }
        if (!lstat.isFile() && !lstat.isSymbolicLink()) {
          throw new Error(`Target path is not a regular file: ${canonicalPath}`);
        }

        const stat = statSync(canonicalPath);
        const buffer = readFileSync(canonicalPath);
        const { sha256, size } = writeCasBlob(this.workspaceHash, buffer);
        preState = {
          kind: 'file',
          sha256,
          mode: stat.mode,
          size,
        };
      } else {
        preState = {
          kind: 'missing',
        };
      }

      const checkpointEntry: FileCheckpoint = {
        relativePath: relPath,
        pre: preState,
        mutationCommitted: false,
      };

      this.files.set(relPath, checkpointEntry);

      // 4. Persist pending journal
      await this.persistPendingJournal();

      return {
        preState,
        releaseLock,
      };
    } catch (err) {
      releaseLock();
      throw err;
    }
  }

  /**
   * Completes a mutation by reading the resulting disk state, ensuring CAS post-image is durable,
   * marking mutationCommitted = true, and updating pending journal.
   */
  public async completeMutation(absoluteOrRelativePath: string): Promise<void> {
    if (!this.activeTurnId) {
      throw new Error('Cannot complete mutation outside an active turn checkpoint tracker.');
    }

    const resolved = resolveDirectMutationPath(this.workspaceRoot, absoluteOrRelativePath);
    const canonicalPath = resolved.absolutePath;
    const relPath = resolved.relativePath;

    const existing = this.files.get(relPath);
    if (!existing) {
      throw new Error(`Mutation completed for untracked path: ${canonicalPath}`);
    }

    let postState: FileState;
    if (existsSync(canonicalPath)) {
      const stat = statSync(canonicalPath);
      const buffer = readFileSync(canonicalPath);
      const { sha256, size } = writeCasBlob(this.workspaceHash, buffer);
      postState = {
        kind: 'file',
        sha256,
        mode: stat.mode,
        size,
      };
    } else {
      postState = {
        kind: 'missing',
      };
    }

    existing.post = postState;
    existing.mutationCommitted = true;

    await this.persistPendingJournal();
  }

  private async persistPendingJournal(): Promise<void> {
    if (!this.activeTurnId || !this.turnStartedAt) return;
    const journal: TurnPendingJournal = {
      kind: 'turn',
      version: CHECKPOINT_SCHEMA_VERSION,
      workspaceHash: this.workspaceHash,
      workspaceRoot: this.workspaceRoot,
      sessionId: this.sessionId,
      turnId: this.activeTurnId,
      status: 'pending',
      startedAt: this.turnStartedAt,
      turnCount: this.turnCount,
      files: Array.from(this.files.values()),
    };
    await savePendingJournal(this.workspaceHash, this.sessionId, journal);
  }

  /**
   * Finalizes the turn checkpoint. If mutations were committed, saves sidecar turn record.
   * Cleans up pending journal.
   */
  public async commitTurn(
    turnId: string,
    turnStatus: 'complete' | 'interrupted' | 'errored' = 'complete',
  ): Promise<void> {
    if (this.activeTurnId !== turnId) {
      return;
    }

    const committedFiles = Array.from(this.files.values()).filter(
      (f) => f.mutationCommitted && f.post !== undefined,
    );

    const turnCheckpoint: TurnCheckpoint = {
      version: CHECKPOINT_SCHEMA_VERSION,
      workspaceHash: this.workspaceHash,
      workspaceRoot: this.workspaceRoot,
      sessionId: this.sessionId,
      turnId,
      status: 'committed',
      startedAt: this.turnStartedAt ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
      files: committedFiles,
    };

    await commitTurnCheckpoint(
      this.workspaceHash,
      this.sessionId,
      this.workspaceRoot,
      turnCheckpoint,
    );

    this.activeTurnId = null;
    this.files.clear();
  }

  /**
   * Abandons current pending turn without committing sidecar.
   */
  public async abandonTurn(): Promise<void> {
    if (this.activeTurnId) {
      await deletePendingJournal(this.workspaceHash, this.sessionId);
      this.activeTurnId = null;
      this.files.clear();
    }
  }
}
