import { isAbsolute, normalize, resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export type ArtifactKind = 'artifact' | 'plan';

/**
 * Resolves and confines a user-provided relative path to the .chuck/ directory.
 * Throws a friendly error if absolute path or directory traversal is attempted.
 */
export function resolveChuckPath(
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
      `Absolute paths are not allowed. Please provide a relative path inside .chuck/${kind === 'plan' ? 'plans' : 'artifacts'}/`,
    );
  }

  // Base directory for kind
  const subDir = kind === 'plan' ? 'plans' : 'artifacts';
  const baseDir = resolve(cwd, '.chuck', subDir);

  // Normalize path without leading slashes
  const cleanRelative = trimmed.replace(/^[/\\]+/, '');
  const resolvedPath = resolve(baseDir, cleanRelative);

  // Ensure resolved path starts with baseDir
  if (resolvedPath !== baseDir && !resolvedPath.startsWith(baseDir + '/')) {
    throw new Error(
      `Path traversal outside .chuck/${subDir}/ is strictly forbidden: "${trimmed}"`,
    );
  }

  // Ensure parent directory exists
  try {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  } catch (err: any) {
    throw new Error(`Failed to create parent directory for "${resolvedPath}": ${err.message}`);
  }

  const displayPath = `.chuck/${subDir}/${cleanRelative}`;
  return { resolvedPath, displayPath };
}
