import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { resolveDirectMutationPath } from '../../checkpoint/path.js';
import type { ToolDefinition } from '../types.js';

export const editFileInputSchema = z.object({
  file_path: z
    .string()
    .describe(
      'The path of the file to edit (relative to current working directory or absolute inside trusted workspace).',
    ),
  old_string: z.string().describe('The exact string to find and replace in the file.'),
  new_string: z.string().describe('The replacement string.'),
  replace_all: z
    .boolean()
    .optional()
    .describe(
      'Whether to replace all occurrences of old_string. Defaults to false (requires unique single occurrence).',
    ),
});

export type EditFileInput = z.infer<typeof editFileInputSchema>;

export interface EditFileOutput {
  file_path: string;
  replacementsMade: number;
  message: string;
}

function countOccurrences(content: string, substring: string): number {
  if (!substring) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = content.indexOf(substring, pos)) !== -1) {
    count++;
    pos += substring.length;
  }
  return count;
}

export const editFileTool: ToolDefinition<typeof editFileInputSchema, EditFileOutput> = {
  name: 'edit_file',
  displayName: 'Edit',
  description:
    'Performs exact string replacements in an existing file. Every mutation is automatically checkpointed for guaranteed rewind safety.',
  parameters: editFileInputSchema,
  confirmationPolicy: 'never',

  summarize: (args) => `edit_file(${args.file_path})`,

  execute: async (args, context) => {
    const { absolutePath: targetPath, relativePath } = resolveDirectMutationPath(
      context.cwd,
      args.file_path,
    );

    if (!existsSync(targetPath)) {
      throw new Error(
        `Cannot edit file because it does not exist: "${args.file_path}". Use write_file to create new files.`,
      );
    }

    let releaseLock: (() => void) | null = null;
    let prepResult: { preState: any; releaseLock: () => void } | null = null;

    if (context.checkpointTracker) {
      prepResult = await context.checkpointTracker.prepareMutation(targetPath);
      releaseLock = prepResult.releaseLock;
    } else if (context.mutationLocks) {
      releaseLock = await context.mutationLocks.acquire(targetPath);
    }

    try {
      const currentContent = readFileSync(targetPath, 'utf-8');

      if (args.old_string === args.new_string) {
        return {
          file_path: args.file_path,
          replacementsMade: 0,
          message: `old_string and new_string are identical; no changes made to ${relativePath}`,
        };
      }

      const matchCount = countOccurrences(currentContent, args.old_string);
      if (matchCount === 0) {
        throw new Error(
          `Target old_string not found in file: "${relativePath}". Please verify the exact whitespace and content.`,
        );
      }

      if (matchCount > 1 && !args.replace_all) {
        throw new Error(
          `Target old_string matched ${matchCount} times in "${relativePath}". Please provide more surrounding context to make the replacement unique, or set replace_all to true.`,
        );
      }

      const updatedContent = args.replace_all
        ? currentContent.replaceAll(args.old_string, args.new_string)
        : currentContent.replace(args.old_string, args.new_string);

      const newBuffer = Buffer.from(updatedContent, 'utf-8');
      const dir = dirname(targetPath);
      let existingMode = 0o644;
      try {
        existingMode = statSync(targetPath).mode;
      } catch {}

      const tmpPath = join(dir, `.tmp-edit-${randomUUID().slice(0, 8)}`);

      let fd: number | null = null;
      try {
        fd = openSync(tmpPath, 'w', existingMode);
        writeSync(fd, newBuffer, 0, newBuffer.length);
        fsyncSync(fd);
        closeSync(fd);
        fd = null;

        try {
          chmodSync(tmpPath, existingMode);
        } catch {}

        renameSync(tmpPath, targetPath);
      } catch (err) {
        if (fd !== null) {
          try {
            closeSync(fd);
          } catch {}
        }
        if (existsSync(tmpPath)) {
          try {
            unlinkSync(tmpPath);
          } catch {}
        }
        throw err;
      }

      if (context.checkpointTracker) {
        await context.checkpointTracker.completeMutation(targetPath);
      }

      return {
        file_path: args.file_path,
        replacementsMade: matchCount,
        message: `Successfully replaced ${matchCount} occurrence(s) in ${relativePath}`,
      };
    } finally {
      if (releaseLock) {
        releaseLock();
      }
    }
  },
};
