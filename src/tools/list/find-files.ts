import { readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const findFilesInputSchema = z.object({
  pattern: z
    .string()
    .describe('Substring or wildcard glob pattern to search for in file names.'),
  path: z
    .string()
    .optional()
    .describe('Starting directory path. Defaults to workspace root.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe('Maximum number of matching file paths to return. Defaults to 100.'),
});

export type FindFilesInput = z.infer<typeof findFilesInputSchema>;

export interface FindFilesOutput {
  query: string;
  files: string[];
  totalMatches: number;
  durationMs: number;
  isTruncated: boolean;
}

function walkDir(dir: string, baseDir: string, pattern: string, results: string[], limit: number) {
  if (results.length >= limit) return;

  const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cache', '.next', '.turbo']);

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    const lowerPattern = pattern.toLowerCase();

    for (const entry of entries) {
      if (results.length >= limit) break;

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          walkDir(join(dir, entry.name), baseDir, pattern, results, limit);
        }
      } else if (entry.isFile()) {
        const rel = relative(baseDir, join(dir, entry.name));
        if (entry.name.toLowerCase().includes(lowerPattern) || rel.toLowerCase().includes(lowerPattern)) {
          results.push(rel);
        }
      }
    }
  } catch {
    // Skip permission errors in directories
  }
}

/**
 * File Find / Glob Tool matching Claude Code & Delta specifications:
 * - Fast workspace filesystem traversal.
 * - Respects standard ignore directories (node_modules, .git, etc.).
 * - Returns relativized paths.
 */
export const findFilesTool: ToolDefinition<typeof findFilesInputSchema, FindFilesOutput> = {
  name: 'find',
  displayName: 'Find',
  description: 'Searches for files in the workspace matching a name or glob pattern.',
  parameters: findFilesInputSchema,
  confirmationPolicy: 'never',

  summarize: (args) => {
    return `find(${args.pattern})`;
  },

  execute: async (args, context) => {
    const startTime = Date.now();
    const searchRoot = args.path
      ? isAbsolute(args.path)
        ? args.path
        : resolve(context.cwd, args.path)
      : context.cwd;

    const limit = args.limit ?? 100;
    const matches: string[] = [];

    walkDir(searchRoot, context.cwd, args.pattern, matches, limit);

    return {
      query: args.pattern,
      files: matches,
      totalMatches: matches.length,
      durationMs: Date.now() - startTime,
      isTruncated: matches.length >= limit,
    };
  },
};
