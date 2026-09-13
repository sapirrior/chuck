import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { computeLineDiff, type DiffLine } from '../../utils/diff.js';
import { boundResultText } from '../bounding.js';
import { reviewTokenCache } from '../review-cache.js';
import type { ConfirmationRequest, ToolDefinition } from '../types.js';

export const editFileInputSchema = z.object({
  path: z
    .string()
    .describe('The path to the file to edit (relative to current working directory or absolute).'),
  old_string: z.string().describe('The exact string to be replaced.'),
  new_string: z.string().describe('The new string to replace old_string with.'),
  replace_all: z
    .boolean()
    .optional()
    .describe('If true, replaces all occurrences of old_string. Defaults to false.'),
});

export type EditFileInput = z.infer<typeof editFileInputSchema>;

export interface EditFileOutput {
  path: string;
  bytesWritten: number;
  replacements: number;
  message: string;
  diffLines?: DiffLine[];
  previewLines?: string[];
  highlightLineIndex?: number;
  highlightCount?: number;
  totalLines?: number;
}

export const editFileTool: ToolDefinition<typeof editFileInputSchema, EditFileOutput> = {
  name: 'edit_file',
  displayName: 'Update',
  description:
    'A tool for editing existing files in place by replacing exact string matches (old_string -> new_string).',
  parameters: editFileInputSchema,
  confirmationPolicy: 'session',

  summarizeArgs: (args) => args.path,

  getConfirmationRequest: (args: EditFileInput): ConfirmationRequest => {
    let oldContent = '';
    let newContent = '';
    const targetPath = isAbsolute(args.path) ? args.path : resolve(process.cwd(), args.path);

    let addedLines = 0;
    let removedLines = 0;
    let smallPreviewDiffLines: DiffLine[] | undefined = undefined;

    if (existsSync(targetPath)) {
      try {
        oldContent = readFileSync(targetPath, 'utf-8');
        newContent = args.replace_all
          ? oldContent.replaceAll(args.old_string, args.new_string)
          : oldContent.replace(args.old_string, args.new_string);

        removedLines = args.old_string.split(/\r?\n/).length;
        addedLines = args.new_string.split(/\r?\n/).length;

        // Compute small preview diff only if file or edit is reasonably small (<200 lines)
        if (oldContent.length + newContent.length < 50000) {
          smallPreviewDiffLines = computeLineDiff(oldContent, newContent, 3).slice(0, 20);
        }
      } catch {
        // Fallback
      }
    }

    const reviewToken = reviewTokenCache.register({
      oldContent,
      newContent,
    });

    return {
      toolName: 'edit_file',
      displayName: 'Update',
      promptTitle: `Update ${args.path}?`,
      preview: {
        kind: 'edit',
        path: args.path,
        statsOnly: { addedLines, removedLines },
        smallPreviewDiffLines,
      },
      reviewToken,
      args: {
        path: args.path,
        old_string: args.old_string,
        new_string: args.new_string,
        oldContent,
        newContent,
      },
    };
  },

  summarize: (args) => {
    return `edit_file(${args.path})`;
  },

  execute: async (args, context) => {
    const targetPath = isAbsolute(args.path) ? args.path : resolve(context.cwd, args.path);

    if (!existsSync(targetPath)) {
      throw new Error(`File not found: ${args.path}`);
    }

    const stat = lstatSync(targetPath);
    if (stat.isDirectory()) {
      throw new Error(`Cannot edit path because it is a directory: ${args.path}`);
    }

    const content = readFileSync(targetPath, 'utf-8');

    if (!content.includes(args.old_string)) {
      throw new Error(`Target string to replace not found in file: ${args.path}`);
    }

    const occurrences = content.split(args.old_string).length - 1;
    if (occurrences > 1 && !args.replace_all) {
      throw new Error(
        `Found ${occurrences} occurrences of old_string in ${args.path}, but replace_all is false. Provide more surrounding context to match uniquely, or set replace_all to true.`,
      );
    }

    const updated = args.replace_all
      ? content.replaceAll(args.old_string, args.new_string)
      : content.replace(args.old_string, args.new_string);

    writeFileSync(targetPath, updated, 'utf-8');
    const bytesWritten = Buffer.byteLength(updated, 'utf-8');

    // Compute unified line diff for preview
    const diffLines = computeLineDiff(content, updated, 10);

    const updatedLines = updated.split(/\r?\n/);
    const charOffset = updated.indexOf(args.new_string);
    const editLineIndex =
      charOffset >= 0 ? updated.slice(0, charOffset).split(/\r?\n/).length - 1 : 0;
    const replacementLinesCount = args.new_string.split(/\r?\n/).length;

    // Bound preview lines so large files don't retain memory
    const { preview: boundedPreview } = boundResultText(updated);
    const previewLines = boundedPreview.split(/\r?\n/);

    return {
      path: args.path,
      bytesWritten,
      replacements: args.replace_all ? occurrences : 1,
      message: `Updated ${args.path}`,
      diffLines,
      previewLines,
      highlightLineIndex: editLineIndex,
      highlightCount: replacementLinesCount,
      totalLines: updatedLines.length,
    };
  },
};
