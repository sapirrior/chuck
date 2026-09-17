import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
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

export const writeFileInputSchema = z.object({
  file_path: z
    .string()
    .describe(
      'The path of the file to write (relative to current working directory or absolute inside trusted workspace).',
    ),
  content: z.string().describe('The full text content to write to the file.'),
});

export type WriteFileInput = z.infer<typeof writeFileInputSchema>;

export interface WriteFileOutput {
  file_path: string;
  bytesWritten: number;
  linesWritten: number;
  isNew: boolean;
  message: string;
}

export const writeFileTool: ToolDefinition<typeof writeFileInputSchema, WriteFileOutput> = {
  name: 'write_file',
  displayName: 'Write',
  description:
    'Writes or creates a whole file in the workspace. Automatically creates parent directories if needed. Every write mutation participates in checkpointing for /rewind.',
  parameters: writeFileInputSchema,
  confirmationPolicy: 'never',

  summarize: (_args, result) => {
    const lines = result?.linesWritten ?? 0;
    return `└ Wrote ${lines} line${lines === 1 ? '' : 's'}`;
  },

  execute: async (args, context) => {
    const { absolutePath: targetPath, relativePath } = resolveDirectMutationPath(
      context.cwd,
      args.file_path,
    );

    let releaseLock: (() => void) | null = null;
    let prepResult: { preState: any; releaseLock: () => void } | null = null;

    if (context.checkpointTracker) {
      prepResult = await context.checkpointTracker.prepareMutation(targetPath);
      releaseLock = prepResult.releaseLock;
    } else if (context.mutationLocks) {
      releaseLock = await context.mutationLocks.acquire(targetPath);
    }

    try {
      const isNew = !existsSync(targetPath);
      const newBuffer = Buffer.from(args.content, 'utf-8');
      const linesWritten = args.content.length === 0 ? 0 : args.content.split(/\r?\n/).length;

      if (!isNew) {
        // Check for no-op write
        const currentBuffer = readFileSync(targetPath);
        if (currentBuffer.equals(newBuffer)) {
          return {
            file_path: args.file_path,
            bytesWritten: currentBuffer.length,
            linesWritten,
            isNew: false,
            message: `File already matches requested content: ${relativePath}`,
          };
        }
      }

      const dir = dirname(targetPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      let existingMode = 0o644;
      if (!isNew) {
        try {
          existingMode = statSync(targetPath).mode;
        } catch {}
      }

      const tmpPath = join(dir, `.tmp-write-${randomUUID().slice(0, 8)}`);

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
        bytesWritten: newBuffer.length,
        linesWritten,
        isNew,
        message: isNew
          ? `Created file: ${relativePath} (${newBuffer.length} bytes)`
          : `Updated file: ${relativePath} (${newBuffer.length} bytes)`,
      };
    } finally {
      if (releaseLock) {
        releaseLock();
      }
    }
  },
};
