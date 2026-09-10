import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const readFileInputSchema = z.object({
  path: z
    .string()
    .describe('The path of the file to read (relative to current working directory or absolute).'),
  offset: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('The line number to start reading from (1-indexed). Defaults to 1.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(2000)
    .optional()
    .describe('The maximum number of lines to read. Defaults to 200.'),
});

export type ReadFileInput = z.infer<typeof readFileInputSchema>;

export interface ReadFileOutput {
  path: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  content: string;
  isTruncated: boolean;
}

/**
 * Checks if a buffer appears to be binary by checking for null bytes.
 */
function isBinaryBuffer(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 1024);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

export const readFileTool: ToolDefinition<typeof readFileInputSchema, ReadFileOutput> = {
  name: 'read_file',
  displayName: 'Read File',
  description:
    'Reads the contents of a file with 1-indexed line numbers. Supports reading specific line ranges via offset and limit.',
  parameters: readFileInputSchema,
  confirmationPolicy: 'never',

  summarize: (args) => {
    const range = args.offset ? `:${args.offset}` : '';
    return `read_file(${args.path}${range})`;
  },

  execute: async (args, context) => {
    const targetPath = isAbsolute(args.path) ? args.path : resolve(context.cwd, args.path);

    if (!existsSync(targetPath)) {
      throw new Error(`File not found: ${args.path}`);
    }

    const stat = lstatSync(targetPath);
    if (stat.isDirectory()) {
      throw new Error(`Cannot read path because it is a directory: ${args.path}`);
    }

    const buffer = readFileSync(targetPath);
    if (isBinaryBuffer(buffer)) {
      return {
        path: args.path,
        totalLines: 0,
        startLine: 0,
        endLine: 0,
        content: `[Binary file: size ${buffer.length} bytes]`,
        isTruncated: false,
      };
    }

    const text = buffer.toString('utf-8');
    const allLines = text.split(/\r?\n/);
    const totalLines = allLines.length;

    const startLine = args.offset ?? 1;
    const limit = args.limit ?? 200;
    const startIndex = Math.max(0, startLine - 1);
    const endIndex = Math.min(totalLines, startIndex + limit);

    const slice = allLines.slice(startIndex, endIndex);
    const padWidth = String(endIndex).length;

    const formattedContent = slice
      .map((line, idx) => {
        const lineNum = String(startIndex + idx + 1).padStart(padWidth, ' ');
        return `${lineNum} | ${line}`;
      })
      .join('\n');

    return {
      path: args.path,
      totalLines,
      startLine,
      endLine: endIndex,
      content: formattedContent,
      isTruncated: endIndex < totalLines,
    };
  },
};
