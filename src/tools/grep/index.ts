import { readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const grepInputSchema = z.object({
  pattern: z.string().describe('The regex or text pattern to search for across files.'),
  path: z
    .string()
    .optional()
    .describe('Target directory or file path to search. Defaults to current directory.'),
  glob: z
    .string()
    .optional()
    .describe('Optional glob pattern to filter file names (e.g. "*.ts", "src/**/*.json").'),
  case_sensitive: z
    .boolean()
    .optional()
    .describe('Whether pattern search is case sensitive. Defaults to false.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Maximum number of matching lines to return. Defaults to 100.'),
});

export type GrepInput = z.infer<typeof grepInputSchema>;

export interface GrepMatch {
  file: string;
  line: number;
  column?: number;
  text: string;
}

export interface GrepOutput {
  pattern: string;
  matches: GrepMatch[];
  totalMatches: number;
  fileCount: number;
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

function searchInDir(
  dir: string,
  baseDir: string,
  regex: RegExp,
  fileFilter: ((relPath: string) => boolean) | null,
  results: GrepMatch[],
  filesWithMatches: Set<string>,
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
          searchInDir(fullPath, baseDir, regex, fileFilter, results, filesWithMatches, limit);
        }
      } else if (entry.isFile()) {
        const relPath = relative(baseDir, fullPath).replace(/\\/g, '/');
        if (fileFilter && !fileFilter(relPath)) {
          continue;
        }

        try {
          const content = readFileSync(fullPath, 'utf-8');
          const lines = content.split(/\r?\n/);

          for (let i = 0; i < lines.length; i++) {
            if (results.length >= limit) break;
            const line = lines[i]!;
            const matchIndex = line.search(regex);
            if (matchIndex !== -1) {
              results.push({
                file: relPath,
                line: i + 1,
                column: matchIndex + 1,
                text: line.trim(),
              });
              filesWithMatches.add(relPath);
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
 * Grep Tool:
 * - Searches file contents for text or regex patterns.
 * - Read-only, no checkpointing.
 */
export const grepTool: ToolDefinition<typeof grepInputSchema, GrepOutput> = {
  name: 'grep',
  displayName: 'Grep',
  description:
    'Searches for text or regex patterns across files in the workspace. Read-only content search with structured match positions.',
  parameters: grepInputSchema,
  confirmationPolicy: 'never',

  summarize: (_args, result) => {
    const matches = result?.totalMatches ?? 0;
    const files = result?.fileCount ?? 0;
    return `└ Found ${matches} match${matches === 1 ? '' : 'es'} in ${files} file${files === 1 ? '' : 's'}`;
  },

  execute: async (args, context) => {
    const startTime = Date.now();
    const searchRoot = args.path
      ? isAbsolute(args.path)
        ? args.path
        : resolve(context.cwd, args.path)
      : context.cwd;

    const limit = args.limit ?? 100;
    const isCaseSensitive = args.case_sensitive ?? false;
    const flags = isCaseSensitive ? '' : 'i';
    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern, flags);
    } catch {
      // Escape regex if invalid pattern provided as plain string
      const escaped = args.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(escaped, flags);
    }

    const fileFilter = args.glob ? (rel: string) => globToRegex(args.glob!).test(rel) : null;
    const matches: GrepMatch[] = [];
    const filesWithMatches = new Set<string>();

    const { statSync, existsSync } = await import('node:fs');
    if (existsSync(searchRoot)) {
      const stat = statSync(searchRoot);
      if (stat.isFile()) {
        try {
          const content = readFileSync(searchRoot, 'utf-8');
          const lines = content.split(/\r?\n/);
          const relPath = relative(context.cwd, searchRoot).replace(/\\/g, '/');

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= limit) break;
            const line = lines[i]!;
            const matchIndex = line.search(regex);
            if (matchIndex !== -1) {
              matches.push({
                file: relPath,
                line: i + 1,
                column: matchIndex + 1,
                text: line.trim(),
              });
              filesWithMatches.add(relPath);
            }
          }
        } catch {}
      } else if (stat.isDirectory()) {
        searchInDir(searchRoot, context.cwd, regex, fileFilter, matches, filesWithMatches, limit);
      }
    }

    return {
      pattern: args.pattern,
      matches,
      totalMatches: matches.length,
      fileCount: filesWithMatches.size,
      durationMs: Date.now() - startTime,
      isTruncated: matches.length >= limit,
    };
  },
};
