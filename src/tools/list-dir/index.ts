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
}

/**
 * List Directory Tool:
 * - Lists directory entries with file types and sizes.
 */
export const listDirTool: ToolDefinition<typeof listDirInputSchema, ListDirOutput> = {
  name: 'list_dir',
  displayName: 'List',
  description: 'Lists files and folders in a specified directory.',
  parameters: listDirInputSchema,
  confirmationPolicy: 'never',

  summarize: (args) => {
    return `list_dir(${args.path || '.'})`;
  },

  execute: async (args, context) => {
    const targetPath = args.path
      ? isAbsolute(args.path)
        ? args.path
        : resolve(context.cwd, args.path)
      : context.cwd;

    const rawEntries = readdirSync(targetPath, { withFileTypes: true });
    const entries: DirEntryInfo[] = [];

    for (const entry of rawEntries) {
      if (entry.name === '.git') continue;

      let type: 'file' | 'directory' | 'other' = 'other';
      let sizeBytes: number | undefined = undefined;

      if (entry.isDirectory()) {
        type = 'directory';
      } else if (entry.isFile()) {
        type = 'file';
        try {
          sizeBytes = statSync(join(targetPath, entry.name)).size;
        } catch {
          // Ignore stat errors
        }
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
    };
  },
};
