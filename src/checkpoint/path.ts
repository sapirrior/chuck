import { createHash } from 'node:crypto';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { normalizeFolderPath } from '../config/settings.js';

/**
 * Computes a stable workspace hash from the workspace root path.
 */
export function computeWorkspaceHash(workspaceRoot: string): string {
  const normalized = normalizeFolderPath(workspaceRoot);
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Checks if a given path is inside (or equal to) the base directory.
 */
export function isPathInside(targetPath: string, basePath: string): boolean {
  const normTarget = normalizeFolderPath(targetPath);
  const normBase = normalizeFolderPath(basePath);

  if (normTarget === normBase) {
    return true;
  }

  const prefix = normBase.endsWith(sep) ? normBase : `${normBase}${sep}`;
  return normTarget.startsWith(prefix);
}

export interface ResolvedMutationPath {
  absolutePath: string;
  relativePath: string;
  workspaceRoot: string;
}

/**
 * Validates and resolves a direct workspace mutation path.
 * Enforces:
 * - Confined within trusted workspace root (cwd).
 * - No path traversal escaping workspace root.
 * - Resolves real path for existing targets and symlinks.
 * - Validates nearest existing parent for new files.
 * - Rejects directory targets.
 * - Rejects non-regular special files (FIFOs, sockets, block devices, etc.).
 */
export function resolveDirectMutationPath(cwd: string, filePath: string): ResolvedMutationPath {
  if (!filePath || !filePath.trim()) {
    throw new Error('File path cannot be empty.');
  }

  const trimmed = filePath.trim();
  const workspaceRoot = normalizeFolderPath(cwd);
  const resolved = isAbsolute(trimmed) ? resolve(trimmed) : resolve(cwd, trimmed);

  // Check simple containment first
  if (!isPathInside(resolved, workspaceRoot)) {
    throw new Error(
      `Access denied: path "${filePath}" resolves outside the trusted workspace root ("${cwd}").`,
    );
  }

  if (existsSync(resolved)) {
    // Resolve symlink to real path
    let realTarget: string;
    try {
      realTarget = realpathSync(resolved);
    } catch {
      realTarget = resolved;
    }

    if (!isPathInside(realTarget, workspaceRoot)) {
      throw new Error(
        `Access denied: symlink "${filePath}" points outside the trusted workspace root.`,
      );
    }

    const stat = lstatSync(resolved);
    if (stat.isDirectory()) {
      throw new Error(`Cannot mutate path because it is a directory: "${filePath}".`);
    }

    if (!stat.isFile() && !stat.isSymbolicLink()) {
      throw new Error(`Cannot mutate special or non-regular file: "${filePath}".`);
    }

    const rel = relative(workspaceRoot, realTarget) || relative(workspaceRoot, resolved);
    return {
      absolutePath: resolved,
      relativePath: rel,
      workspaceRoot,
    };
  }

  // File does not exist yet: verify nearest existing parent directory
  let currentDir = dirname(resolved);
  while (!existsSync(currentDir)) {
    const parent = dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }

  if (existsSync(currentDir)) {
    let realParent: string;
    try {
      realParent = realpathSync(currentDir);
    } catch {
      realParent = currentDir;
    }

    if (!isPathInside(realParent, workspaceRoot)) {
      throw new Error(
        `Access denied: parent directory for "${filePath}" resolves outside the trusted workspace root.`,
      );
    }
  }

  const rel = relative(workspaceRoot, resolved);
  return {
    absolutePath: resolved,
    relativePath: rel,
    workspaceRoot,
  };
}
