import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface FileMatch {
  relativePath: string;
  isDir: boolean;
}

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.cache',
  'references',
  '.agents',
]);

/**
 * Searches the workspace for files matching the given @ query prefix.
 */
export async function searchWorkspaceFiles(
  cwd: string,
  query: string,
  limit = 8,
): Promise<string[]> {
  const results: string[] = [];
  const normalizedQuery = query.toLowerCase().trim();

  async function walk(currentDir: string, relativeRoot = ''): Promise<void> {
    if (results.length >= limit * 2) return;

    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= limit) return;
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const relPath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
      } else if (entry.isFile()) {
        if (!normalizedQuery || relPath.toLowerCase().includes(normalizedQuery)) {
          results.push(relPath);
        }
      }
    }
  }

  await walk(cwd);
  return results.slice(0, limit);
}
