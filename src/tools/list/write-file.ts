import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
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
}

/**
 * Write File Tool matching Anthropic Claude Code & Delta standards:
 * - Creates new files or overwrites existing files completely.
 * - Automatically ensures parent directories exist.
 * - Generates structured diff metadata for confirmation dialogs.
 * - Summarizes cleanly in single-line tool bullet logs.
 */
export const writeFileTool: ToolDefinition<typeof writeFileInputSchema, WriteFileOutput> = {
  name: 'write_file',
  displayName: 'Write File',
  description:
    'Writes a file to the local filesystem. Creates new files or completely overwrites existing files. Automatically creates parent directories.',
  parameters: writeFileInputSchema,
  confirmationPolicy: 'session',

  getConfirmationRequest: (args: WriteFileInput): ConfirmationRequest => {
    let oldContent = '';
    const targetPath = isAbsolute(args.path) ? args.path : resolve(process.cwd(), args.path);
    const exists = existsSync(targetPath);

    if (exists) {
      try {
        const stat = lstatSync(targetPath);
        if (!stat.isDirectory()) {
          oldContent = readFileSync(targetPath, 'utf-8');
        }
      } catch {
        // Ignore read errors for preview
      }
    }

    return {
      toolName: 'write_file',
      displayName: 'Write File',
      promptTitle: exists ? `Overwrite existing file ${args.path}?` : `Create new file ${args.path}?`,
      args: {
        path: args.path,
        content: args.content,
        oldContent,
        newContent: args.content,
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
    const linesWritten = args.content.split(/\r?\n/).length;

    return {
      type: exists ? 'update' : 'create',
      path: args.path,
      bytesWritten,
      linesWritten,
      message: exists
        ? `The file ${args.path} has been updated successfully (${bytesWritten} bytes, ${linesWritten} lines).`
        : `File created successfully at: ${args.path} (${bytesWritten} bytes, ${linesWritten} lines).`,
    };
  },
};
