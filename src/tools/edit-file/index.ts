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
import chalk from 'chalk';
import { getTheme } from '../../theme/index.js';
import { themeColor, themeBgColor } from '../../tui/utils/format.js';
import { resolveDirectMutationPath } from '../../services/checkpoint/path.js';
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
  addedLines: number;
  removedLines: number;
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
    'Performs exact string replacements in an existing file. Every edit mutation participates in checkpointing for /rewind.',
  parameters: editFileInputSchema,
  confirmationPolicy: 'never',

  summarize: (args, result) => {
    const added = result?.addedLines ?? 0;
    const removed = result?.removedLines ?? 0;
    const summary = `Added ${added} line${added === 1 ? '' : 's'}, removed ${removed} line${removed === 1 ? '' : 's'}`;

    const oldLines = args.old_string.split(/\r?\n/);
    const newLines = args.new_string.split(/\r?\n/);

    // No-op: nothing changed
    if (added === 0 && removed === 0) return summary;

    const cap = 30;
    const padWidth = String(Math.max(oldLines.length, newLines.length)).length;

    const theme = getTheme();
    const deleteStyle = (str: string) =>
      themeBgColor(theme.diffDeleteBG)(themeColor(theme.diffDeleteFG)(str));
    const addStyle = (str: string) =>
      themeBgColor(theme.diffAddBG)(themeColor(theme.diffAddFG)(str));

    const removedDetail = oldLines
      .slice(0, cap)
      .map((l, i) => deleteStyle(`${String(i + 1).padStart(padWidth)} -${l}`))
      .join('\n');
    const addedDetail = newLines
      .slice(0, cap)
      .map((l, i) => addStyle(`${String(i + 1).padStart(padWidth)} +${l}`))
      .join('\n');

    const overflowOld =
      oldLines.length > cap ? `\n   … (${oldLines.length - cap} more removed)` : '';
    const overflowNew = newLines.length > cap ? `\n   … (${newLines.length - cap} more added)` : '';

    const diffBlock = [removedDetail + overflowOld, addedDetail + overflowNew]
      .filter(Boolean)
      .join('\n');

    return `${summary}\n${diffBlock}`;
  },

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

    const currentContent = readFileSync(targetPath, 'utf-8');

    // 1. Check for no-op edit (old_string === new_string)
    if (args.old_string === args.new_string) {
      return {
        file_path: args.file_path,
        replacementsMade: 0,
        addedLines: 0,
        removedLines: 0,
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

    // If replacement resulted in no net change
    if (currentContent === updatedContent) {
      return {
        file_path: args.file_path,
        replacementsMade: 0,
        addedLines: 0,
        removedLines: 0,
        message: `No changes made to ${relativePath}`,
      };
    }

    // 2. Prepare checkpoint and acquire mutation lock
    let releaseLock: (() => void) | null = null;
    let prepResult: { preState: any; releaseLock: () => void } | null = null;

    if (context.checkpointTracker) {
      prepResult = await context.checkpointTracker.prepareMutation(targetPath);
      releaseLock = prepResult.releaseLock;
    } else if (context.mutationLocks) {
      releaseLock = await context.mutationLocks.acquire(targetPath);
    }

    try {
      // 3. Request user permission
      if (!context.requestFilePermission) {
        throw new Error('File edit permission denied (non-interactive).');
      }

      const perm = await context.requestFilePermission({
        kind: 'edit',
        filePath: relativePath,
        before: currentContent,
        after: updatedContent,
      });

      if (!perm.allowed) {
        throw new Error('File edit permission denied by user.');
      }

      // 4. Validate target state hasn't changed externally during review window
      if (!existsSync(targetPath)) {
        throw new Error(
          `File was deleted externally during approval review: "${relativePath}". Mutation aborted.`,
        );
      }
      const freshContent = readFileSync(targetPath, 'utf-8');
      if (freshContent !== currentContent) {
        throw new Error(
          `File was modified externally during approval review: "${relativePath}". Mutation aborted to prevent data loss.`,
        );
      }

      // 5. Compute actual line deltas
      const beforeLines = currentContent.split(/\r?\n/);
      const afterLines = updatedContent.split(/\r?\n/);
      const lineDelta = afterLines.length - beforeLines.length;

      let addedLines = 0;
      let removedLines = 0;

      const oldLinesInMatch = args.old_string.split(/\r?\n/).length;
      const newLinesInMatch = args.new_string.split(/\r?\n/).length;
      const totalReplacedOccurrences = args.replace_all ? matchCount : 1;

      if (
        oldLinesInMatch === newLinesInMatch &&
        !args.old_string.includes('\n') &&
        !args.new_string.includes('\n')
      ) {
        // Single-line modified in place
        addedLines = totalReplacedOccurrences;
        removedLines = totalReplacedOccurrences;
      } else {
        removedLines =
          (oldLinesInMatch - 1) * totalReplacedOccurrences +
          (lineDelta < 0 ? Math.abs(lineDelta) : 0);
        addedLines =
          (newLinesInMatch - 1) * totalReplacedOccurrences + (lineDelta > 0 ? lineDelta : 0);
        if (addedLines === 0 && removedLines === 0 && args.old_string !== args.new_string) {
          addedLines = totalReplacedOccurrences;
          removedLines = totalReplacedOccurrences;
        }
      }

      // 6. Atomic file write
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

      // 7. Complete checkpoint mutation
      if (context.checkpointTracker) {
        await context.checkpointTracker.completeMutation(targetPath);
      }

      return {
        file_path: args.file_path,
        replacementsMade: matchCount,
        addedLines,
        removedLines,
        message: `Successfully replaced ${matchCount} occurrence(s) in ${relativePath}`,
      };
    } finally {
      if (releaseLock) {
        releaseLock();
      }
    }
  },
};
