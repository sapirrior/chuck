import { isAbsolute, normalize, resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export type ArtifactKind = 'artifact' | 'plan';

/**
 * Resolves and confines a user-provided relative path to the .steward/ directory.
 * Throws a friendly error if absolute path or directory traversal is attempted.
 */
export function resolveSafePath(
  cwd: string,
  relativePath: string,
  kind: ArtifactKind = 'artifact',
): { resolvedPath: string; displayPath: string } {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error(`Path cannot be empty.`);
  }

  const trimmed = relativePath.trim();
  if (!trimmed) {
    throw new Error(`Path cannot be empty.`);
  }

  if (isAbsolute(trimmed)) {
    throw new Error(
      `Absolute paths are not allowed. Please provide a relative path inside .steward/${kind === 'plan' ? 'plans' : 'artifacts'}/`,
    );
  }

  // Base directory for kind
  const subDir = kind === 'plan' ? 'plans' : 'artifacts';
  const baseDir = resolve(cwd, '.steward', subDir);

  // Normalize path without leading slashes
  const cleanRelative = trimmed.replace(/^[/\\]+/, '');
  const resolvedPath = resolve(baseDir, cleanRelative);

  // Ensure resolved path starts with baseDir
  if (resolvedPath !== baseDir && !resolvedPath.startsWith(baseDir + '/')) {
    throw new Error(
      `Path traversal outside .steward/${subDir}/ is strictly forbidden: "${trimmed}"`,
    );
  }

  // Ensure parent directory exists
  try {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  } catch (err: any) {
    throw new Error(`Failed to create parent directory for "${resolvedPath}": ${err.message}`);
  }

  const displayPath = `.steward/${subDir}/${cleanRelative}`;
  return { resolvedPath, displayPath };
}

// Named alias
export const resolveStewardPath = resolveSafePath;
