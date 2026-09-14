import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { resolveChuckPath } from '../chuck-paths.js';
import type { ToolDefinition } from '../types.js';

export const EditArtifactParamsSchema = z.object({
  path: z
    .string()
    .describe('Relative path for the artifact inside .chuck/artifacts/ (e.g. "src/engine.ts")'),
  old_string: z.string().describe('Exact unique string block to replace in the artifact'),
  new_string: z.string().describe('Replacement string block'),
});

export type EditArtifactParams = z.infer<typeof EditArtifactParamsSchema>;

export interface EditArtifactResult {
  path: string;
  replacements: number;
  message: string;
}

export const editArtifactTool: ToolDefinition<typeof EditArtifactParamsSchema, EditArtifactResult> =
  {
    name: 'edit_artifact',
    displayName: 'Edit Artifact',
    icon: '✎',
    description:
      'Edits an existing artifact file inside .chuck/artifacts/ by replacing an exact unique occurrence of old_string with new_string. Never edits the host project.',
    parameters: EditArtifactParamsSchema,
    confirmationPolicy: 'never',

    summarizeArgs: (args) => JSON.stringify({ path: args.path }),

    async execute(args, context): Promise<EditArtifactResult> {
      const { resolvedPath, displayPath } = resolveChuckPath(context.cwd, args.path, 'artifact');

      if (!existsSync(resolvedPath)) {
        throw new Error(`Artifact file "${displayPath}" does not exist.`);
      }

      const currentContent = readFileSync(resolvedPath, 'utf-8');
      const { old_string, new_string } = args;

      if (!old_string) {
        throw new Error('old_string cannot be empty.');
      }

      const firstIndex = currentContent.indexOf(old_string);
      if (firstIndex === -1) {
        throw new Error(
          `Could not find the target old_string in "${displayPath}". Please verify the exact whitespace and content.`,
        );
      }

      const secondIndex = currentContent.indexOf(old_string, firstIndex + old_string.length);
      if (secondIndex !== -1) {
        throw new Error(
          `Multiple matches found for old_string in "${displayPath}". Please provide more surrounding context to make it unique.`,
        );
      }

      const updatedContent =
        currentContent.slice(0, firstIndex) +
        new_string +
        currentContent.slice(firstIndex + old_string.length);

      writeFileSync(resolvedPath, updatedContent, 'utf-8');

      return {
        path: displayPath,
        replacements: 1,
        message: `Updated ${displayPath}`,
      };
    },

    summarize: (args, result) => {
      return result ? result.message : `edit_artifact(${args.path})`;
    },
  };
