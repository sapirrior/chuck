import { readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const globInputSchema = z.object({
  pattern: z
    .string()
    .describe('Glob pattern to match files against (e.g. "**/*.ts", "src/*.json").'),
  path: z.string().optional().describe('Starting directory path. Defaults to workspace root.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Maximum number of matching file paths to return. Defaults to 100.'),
});

export type GlobInput = z.infer<typeof globInputSchema>;

export interface GlobOutput {
  pattern: string;
  files: string[];
  totalMatches: number;
  durationMs: number;
  isTruncated: boolean;
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.cache',
  '.next',
  '.turbo',
]);

function globToRegex(glob: string): RegExp {
  let escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/(?<!\.)\*/g, '[^/]*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function walkDir(
  dir: string,
  baseDir: string,
  matcher: (relPath: string, fileName: string) => boolean,
  results: string[],
  limit: number,
) {
  if (results.length >= limit) return;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= limit) break;

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          walkDir(join(dir, entry.name), baseDir, matcher, results, limit);
        }
      } else if (entry.isFile()) {
        const rel = relative(baseDir, join(dir, entry.name));
        if (matcher(rel, entry.name)) {
          results.push(rel);
        }
      }
    }
  } catch {
    // Skip permission errors in unreadable directories
  }
}

/**
 * Glob Tool:
 * - Finds filesystem paths matching a glob or substring pattern.
 * - Dedicated deterministic filesystem-search capability (read-only, no checkpointing).
 */
export const globTool: ToolDefinition<typeof globInputSchema, GlobOutput> = {
  name: 'glob',
  displayName: 'Glob',
  description:
    'Finds files matching a glob pattern or file name in the workspace. Read-only search capability with bounded results.',
  parameters: globInputSchema,
  confirmationPolicy: 'never',

  summarize: (_args, result) => {
    const count = result?.totalMatches ?? 0;
    return `└ Found ${count} file${count === 1 ? '' : 's'}`;
  },

  execute: async (args, context) => {
    const startTime = Date.now();
    const searchRoot = args.path
      ? isAbsolute(args.path)
        ? args.path
        : resolve(context.cwd, args.path)
      : context.cwd;

    const limit = args.limit ?? 100;
    const pattern = args.pattern.trim();
    const regex = globToRegex(pattern);
    const lowerPattern = pattern.toLowerCase();

    const matcher = (rel: string, fileName: string) => {
      const normalizedRel = rel.replace(/\\/g, '/');
      return (
        regex.test(normalizedRel) ||
        regex.test(fileName) ||
        fileName.toLowerCase().includes(lowerPattern) ||
        normalizedRel.toLowerCase().includes(lowerPattern)
      );
    };

    const matches: string[] = [];
    walkDir(searchRoot, context.cwd, matcher, matches, limit);

    return {
      pattern: args.pattern,
      files: matches,
      totalMatches: matches.length,
      durationMs: Date.now() - startTime,
      isTruncated: matches.length >= limit,
    };
  },
};
