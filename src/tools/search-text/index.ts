import { readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const searchTextInputSchema = z.object({
  query: z.string().describe('The regex or text pattern to search for across files.'),
  path: z
    .string()
    .optional()
    .describe('Target directory to search. Defaults to current directory.'),
  case_insensitive: z.boolean().optional().describe('Whether search is case insensitive.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe('Maximum number of matching lines to return. Defaults to 100.'),
});

export type SearchTextInput = z.infer<typeof searchTextInputSchema>;

export interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

export interface SearchTextOutput {
  query: string;
  matches: SearchMatch[];
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

function searchInDir(
  dir: string,
  baseDir: string,
  regex: RegExp,
  results: SearchMatch[],
  limit: number,
) {
  if (results.length >= limit) return;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= limit) break;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          searchInDir(fullPath, baseDir, regex, results, limit);
        }
      } else if (entry.isFile()) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const lines = content.split(/\r?\n/);
          const relPath = relative(baseDir, fullPath);

          for (let i = 0; i < lines.length; i++) {
            if (results.length >= limit) break;
            const line = lines[i]!;
            if (regex.test(line)) {
              results.push({
                file: relPath,
                line: i + 1,
                content: line.trim(),
              });
            }
          }
        } catch {
          // Skip binary or unreadable files
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }
}

/**
 * Text Search (Grep) Tool:
 * - Recursively searches files for pattern matches.
 * - Extracts file path, line numbers, and matching line content.
 */
export const searchTextTool: ToolDefinition<typeof searchTextInputSchema, SearchTextOutput> = {
  name: 'search_text',
  displayName: 'Search',
  description:
    'Searches for text or regex patterns across files in the workspace (equivalent to ripgrep / grep).',
  parameters: searchTextInputSchema,
  confirmationPolicy: 'never',

  summarize: (args, result) => {
    if (!result) return `Searching for "${args.query}"`;
    const count = result.totalMatches;
    const files = new Set(result.matches.map((m) => m.file)).size;
    const truncated = result.isTruncated ? ' (truncated)' : '';
    const ms = result.durationMs;
    const timeStr = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
    return `Found ${count} match${count === 1 ? '' : 'es'} in ${files} file${files === 1 ? '' : 's'} · ${timeStr}${truncated}`;
  },

  execute: async (args, context) => {
    const startTime = Date.now();
    const searchRoot = args.path
      ? isAbsolute(args.path)
        ? args.path
        : resolve(context.cwd, args.path)
      : context.cwd;

    const limit = args.limit ?? 100;
    const flags = args.case_insensitive ? 'i' : '';
    const regex = new RegExp(args.query, flags);
    const matches: SearchMatch[] = [];

    searchInDir(searchRoot, context.cwd, regex, matches, limit);

    return {
      query: args.query,
      matches,
      totalMatches: matches.length,
      durationMs: Date.now() - startTime,
      isTruncated: matches.length >= limit,
    };
  },
};
