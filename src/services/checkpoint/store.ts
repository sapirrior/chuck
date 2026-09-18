import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { getCheckpointsRootDir } from './cas.js';
import {
  type PendingJournal,
  type SessionCheckpointManifest,
  type TurnCheckpoint,
  PendingJournalSchema,
  SessionCheckpointManifestSchema,
  CHECKPOINT_SCHEMA_VERSION,
} from './types.js';

export function getSessionCheckpointDir(workspaceHash: string, sessionId: string): string {
  return join(getCheckpointsRootDir(), workspaceHash, 'sessions', sessionId);
}

export function getManifestPath(workspaceHash: string, sessionId: string): string {
  return join(getSessionCheckpointDir(workspaceHash, sessionId), 'manifest.json');
}

export function getPendingJournalPath(workspaceHash: string, sessionId: string): string {
  return join(getSessionCheckpointDir(workspaceHash, sessionId), 'pending.json');
}

/**
 * Serializes writes per session directory to avoid racing on JSON updates.
 */
class SessionStoreSerializer {
  private queues = new Map<string, Promise<void>>();

  public async run<T>(key: string, task: () => Promise<T> | T): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    let resolveTask!: () => void;
    const taskPromise = new Promise<void>((res) => {
      resolveTask = res;
    });

    this.queues.set(
      key,
      prev.then(
        () => taskPromise,
        () => taskPromise,
      ),
    );

    await prev;
    try {
      return await task();
    } finally {
      resolveTask();
      if (this.queues.get(key) === taskPromise) {
        this.queues.delete(key);
      }
    }
  }
}

const storeSerializer = new SessionStoreSerializer();

/**
 * Atomically writes a JSON payload using temp file + fsync + rename.
 */
function atomicWriteJson(targetPath: string, data: unknown): void {
  const dir = join(targetPath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${targetPath}.tmp-${randomUUID().slice(0, 8)}`;
  const payload = JSON.stringify(data, null, 2) + '\n';
  let fd: number | null = null;
  try {
    fd = openSync(tmpPath, 'w', 0o600);
    writeSync(fd, payload, 0, 'utf-8');
    fsyncSync(fd);
    closeSync(fd);
    fd = null;

    renameSync(tmpPath, targetPath);
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
 * Quarantines a malformed checkpoint file.
 */
function quarantineCheckpointFile(filePath: string): void {
  try {
    if (!existsSync(filePath)) return;
    const dir = join(filePath, '..', '.quarantine');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const fileName = `${filePath.split('/').pop()}-${Date.now()}-${randomUUID().slice(0, 6)}`;
    renameSync(filePath, join(dir, fileName));
  } catch {}
}

/**
 * Loads and validates a session's checkpoint manifest.
 */
export function loadCheckpointManifest(
  workspaceHash: string,
  sessionId: string,
): SessionCheckpointManifest | null {
  const targetPath = getManifestPath(workspaceHash, sessionId);
  if (!existsSync(targetPath)) {
    return null;
  }

  try {
    const raw = readFileSync(targetPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = SessionCheckpointManifestSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    quarantineCheckpointFile(targetPath);
    return null;
  } catch {
    quarantineCheckpointFile(targetPath);
    return null;
  }
}

/**
 * Persists a session checkpoint manifest atomically.
 */
export async function saveCheckpointManifest(
  workspaceHash: string,
  sessionId: string,
  manifest: SessionCheckpointManifest,
): Promise<void> {
  const key = `${workspaceHash}:${sessionId}`;
  await storeSerializer.run(key, () => {
    const targetPath = getManifestPath(workspaceHash, sessionId);
    atomicWriteJson(targetPath, manifest);
  });
}

/**
 * Loads pending journal if one exists.
 */
export function loadPendingJournal(
  workspaceHash: string,
  sessionId: string,
): PendingJournal | null {
  const targetPath = getPendingJournalPath(workspaceHash, sessionId);
  if (!existsSync(targetPath)) {
    return null;
  }

  try {
    const raw = readFileSync(targetPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = PendingJournalSchema.safeParse(parsed);
    if (result.success) {
      return result.data as PendingJournal;
    }
    quarantineCheckpointFile(targetPath);
    return null;
  } catch {
    quarantineCheckpointFile(targetPath);
    return null;
  }
}

/**
 * Persists pending journal atomically.
 */
export async function savePendingJournal(
  workspaceHash: string,
  sessionId: string,
  journal: PendingJournal,
): Promise<void> {
  const key = `${workspaceHash}:${sessionId}`;
  await storeSerializer.run(key, () => {
    const targetPath = getPendingJournalPath(workspaceHash, sessionId);
    atomicWriteJson(targetPath, journal);
  });
}

/**
 * Deletes the pending journal file.
 */
export async function deletePendingJournal(
  workspaceHash: string,
  sessionId: string,
): Promise<void> {
  const key = `${workspaceHash}:${sessionId}`;
  await storeSerializer.run(key, () => {
    const targetPath = getPendingJournalPath(workspaceHash, sessionId);
    if (existsSync(targetPath)) {
      try {
        unlinkSync(targetPath);
      } catch {}
    }
  });
}

/**
 * Commits a completed turn checkpoint into the session manifest and removes the pending journal.
 */
export async function commitTurnCheckpoint(
  workspaceHash: string,
  sessionId: string,
  workspaceRoot: string,
  turn: TurnCheckpoint,
): Promise<void> {
  const key = `${workspaceHash}:${sessionId}`;
  await storeSerializer.run(key, () => {
    let manifest = loadCheckpointManifest(workspaceHash, sessionId);
    if (!manifest) {
      manifest = {
        version: CHECKPOINT_SCHEMA_VERSION,
        sessionId,
        workspaceHash,
        workspaceRoot,
        turns: [],
      };
    }

    // Replace or append turn
    const existingIndex = manifest.turns.findIndex((t) => t.turnId === turn.turnId);
    if (existingIndex >= 0) {
      manifest.turns[existingIndex] = turn;
    } else {
      manifest.turns.push(turn);
    }

    const manifestPath = getManifestPath(workspaceHash, sessionId);
    atomicWriteJson(manifestPath, manifest);

    // Remove pending journal
    const pendingPath = getPendingJournalPath(workspaceHash, sessionId);
    if (existsSync(pendingPath)) {
      try {
        unlinkSync(pendingPath);
      } catch {}
    }
  });
}
