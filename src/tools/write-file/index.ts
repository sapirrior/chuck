import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { boundResultText } from '../bounding.js';
import { reviewTokenCache } from '../review-cache.js';
import type { ConfirmationRequest, ToolDefinition } from '../types.js';

export const writeFileInputSchema = z.object({
  path: z
    .string()
    .describe('The path to the file to write (relative to current working directory or absolute).'),
  content: z.string().describe('The full content to write to the file.'),
});

export type WriteFileInput = z.infer<typeof writeFileInputSchema>;

export interface WriteFileOutput {
  type: 'create' | 'update';
  path: string;
  bytesWritten: number;
  linesWritten: number;
  message: string;
  previewLines?: string[];
  totalLines?: number;
}

export const writeFileTool: ToolDefinition<typeof writeFileInputSchema, WriteFileOutput> = {
  name: 'write_file',
  displayName: 'Write',
  description:
    'Writes a file to the local filesystem. Creates new files or completely overwrites existing files. Automatically creates parent directories.',
  parameters: writeFileInputSchema,
  confirmationPolicy: 'session',

  summarizeArgs: (args) => args.path,

  getConfirmationRequest: (args: WriteFileInput): ConfirmationRequest => {
    const targetPath = isAbsolute(args.path) ? args.path : resolve(process.cwd(), args.path);
    const exists = existsSync(targetPath);
    const allLines = args.content.split(/\r?\n/);
    const totalLines = allLines.length;
    const bytesWritten = Buffer.byteLength(args.content, 'utf-8');

    const smallPreviewLines = allLines.slice(0, 20);

    const reviewToken = reviewTokenCache.register({
      fullText: args.content,
    });

    return {
      toolName: 'write_file',
      displayName: 'Write',
      promptTitle: exists
        ? `Overwrite existing file ${args.path}?`
        : `Create new file ${args.path}?`,
      preview: {
        kind: 'write',
        path: args.path,
        isNewFile: !exists,
        totalLines,
        bytesWritten,
        smallPreviewLines,
      },
      reviewToken,
      args: {
        path: args.path,
        content: args.content,
      },
    };
  },

  summarize: (args) => {
    return `write_file(${args.path})`;
  },

  execute: async (args, context) => {
    const targetPath = isAbsolute(args.path) ? args.path : resolve(context.cwd, args.path);

    if (existsSync(targetPath)) {
      const stat = lstatSync(targetPath);
      if (stat.isDirectory()) {
        throw new Error(`Cannot write file because target path is a directory: ${args.path}`);
      }
    }

    const parentDir = dirname(targetPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    const exists = existsSync(targetPath);
    writeFileSync(targetPath, args.content, 'utf-8');

    const bytesWritten = Buffer.byteLength(args.content, 'utf-8');
    const allLines = args.content.split(/\r?\n/);
    const linesWritten = allLines.length;

    // Bounded preview
    const { preview: boundedPreview } = boundResultText(args.content);
    const previewLines = boundedPreview.split(/\r?\n/);

    return {
      type: exists ? 'update' : 'create',
      path: args.path,
      bytesWritten,
      linesWritten,
      message: `Wrote ${linesWritten} lines to ${args.path}`,
      previewLines,
      totalLines: linesWritten,
    };
  },
};
