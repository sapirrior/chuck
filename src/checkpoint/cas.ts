import { createHash, randomUUID } from 'node:crypto';
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
import { homedir } from 'node:os';
import { join } from 'node:path';

export function getCheckpointsRootDir(): string {
  if (process.env.STEWARD_CHECKPOINTS_DIR) {
    return process.env.STEWARD_CHECKPOINTS_DIR;
  }
  return join(homedir(), '.steward', 'checkpoints');
}

export function getWorkspaceCasDir(workspaceHash: string): string {
  return join(getCheckpointsRootDir(), workspaceHash, 'cas');
}

export function getBlobPath(workspaceHash: string, sha256: string): string {
  return join(getWorkspaceCasDir(workspaceHash), sha256);
}

export function computeSha256(data: Buffer | Uint8Array | string): string {
  const hash = createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Stores raw file bytes in the project-scoped Content-Addressed Store.
 * Uses temp file + fsync + atomic rename to ensure durability.
 * Deduplicates: if the blob already exists, it is verified and kept as-is.
 */
export function writeCasBlob(
  workspaceHash: string,
  content: Buffer | Uint8Array | string,
): { sha256: string; path: string; size: number } {
  const buffer = Buffer.isBuffer(content)
    ? content
    : typeof content === 'string'
      ? Buffer.from(content, 'utf-8')
      : Buffer.from(content);

  const sha256 = computeSha256(buffer);
  const casDir = getWorkspaceCasDir(workspaceHash);
  if (!existsSync(casDir)) {
    mkdirSync(casDir, { recursive: true });
  }

  const targetPath = getBlobPath(workspaceHash, sha256);

  if (existsSync(targetPath)) {
    return { sha256, path: targetPath, size: buffer.length };
  }

  const tmpPath = join(casDir, `.tmp-${sha256}-${randomUUID().slice(0, 8)}`);
  let fd: number | null = null;
  try {
    fd = openSync(tmpPath, 'w', 0o600);
    writeSync(fd, buffer, 0, buffer.length);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;

    renameSync(tmpPath, targetPath);

    return { sha256, path: targetPath, size: buffer.length };
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
 * Reads a CAS blob by its sha256. Throws if missing or corrupt.
 */
export function readCasBlob(workspaceHash: string, sha256: string): Buffer {
  const targetPath = getBlobPath(workspaceHash, sha256);
  if (!existsSync(targetPath)) {
    throw new Error(`CAS blob not found: ${sha256} in workspace ${workspaceHash}`);
  }

  const buffer = readFileSync(targetPath);
  const actualHash = computeSha256(buffer);
  if (actualHash !== sha256) {
    throw new Error(`CAS blob corruption detected for ${sha256}: computed hash is ${actualHash}`);
  }

  return buffer;
}

/**
 * Checks whether a CAS blob exists.
 */
export function hasCasBlob(workspaceHash: string, sha256: string): boolean {
  const targetPath = getBlobPath(workspaceHash, sha256);
  return existsSync(targetPath);
}

/**
 * Verifies that a CAS blob exists and is uncorrupted.
 */
export function verifyCasBlob(workspaceHash: string, sha256: string): boolean {
  try {
    readCasBlob(workspaceHash, sha256);
    return true;
  } catch {
    return false;
  }
}
