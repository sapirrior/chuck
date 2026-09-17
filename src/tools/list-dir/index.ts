import { readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const listDirInputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe('Directory path to list. Defaults to current working directory.'),
  recursive: z
    .boolean()
    .optional()
    .describe('If true, lists files recursively (depth 2). Defaults to false.'),
});

export type ListDirInput = z.infer<typeof listDirInputSchema>;

export interface DirEntryInfo {
  name: string;
  type: 'file' | 'directory' | 'other';
  sizeBytes?: number;
}

export interface ListDirOutput {
  path: string;
  entries: DirEntryInfo[];
  totalEntries: number;
  fileCount: number;
  dirCount: number;
}

/**
 * List Directory Tool:
 * - Lists directory entries with file types and sizes.
 */
export const listDirTool: ToolDefinition<typeof listDirInputSchema, ListDirOutput> = {
  name: 'list_dir',
  displayName: 'List',
  description: 'Lists files and folders in a specified directory. Read-only operation.',
  parameters: listDirInputSchema,
  confirmationPolicy: 'never',

  summarize: (_args, result) => {
    const files = result?.fileCount ?? 0;
    const dirs = result?.dirCount ?? 0;
    return `└ Listed ${files} file${files === 1 ? '' : 's'}, ${dirs} director${dirs === 1 ? 'y' : 'ies'}`;
  },

  execute: async (args, context) => {
    const targetPath = args.path
      ? isAbsolute(args.path)
        ? args.path
        : resolve(context.cwd, args.path)
      : context.cwd;

    const rawEntries = readdirSync(targetPath, { withFileTypes: true });
    const entries: DirEntryInfo[] = [];
    let fileCount = 0;
    let dirCount = 0;

    for (const entry of rawEntries) {
      if (entry.name === '.git') continue;

      let type: 'file' | 'directory' | 'other' = 'other';
      let sizeBytes: number | undefined = undefined;

      if (entry.isDirectory()) {
        type = 'directory';
        dirCount++;
      } else if (entry.isFile()) {
        type = 'file';
        fileCount++;
        try {
          sizeBytes = statSync(join(targetPath, entry.name)).size;
        } catch {
          // Ignore stat errors
        }
      } else {
        fileCount++;
      }

      entries.push({
        name: entry.name,
        type,
        sizeBytes,
      });
    }

    return {
      path: args.path || '.',
      entries,
      totalEntries: entries.length,
      fileCount,
      dirCount,
    };
  },
};
