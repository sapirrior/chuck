import { existsSync, unlinkSync, rmSync, statSync } from 'node:fs';
import { z } from 'zod';
import { resolveChuckPath } from '../chuck-paths.js';
import type { ToolDefinition } from '../types.js';

export const DeleteArtifactParamsSchema = z.object({
  path: z.string().describe('Relative path of the artifact file or directory inside .chuck/artifacts/ to delete'),
});

export type DeleteArtifactParams = z.infer<typeof DeleteArtifactParamsSchema>;

export interface DeleteArtifactResult {
  path: string;
  message: string;
}

export const deleteArtifactTool: ToolDefinition<typeof DeleteArtifactParamsSchema, DeleteArtifactResult> = {
  name: 'delete_artifact',
  displayName: 'Delete Artifact',
  icon: '🗑',
  description:
    'Permanently deletes an artifact file or directory inside .chuck/artifacts/. CRITICAL: Only call this tool when the user has explicitly requested deletion. If not explicitly requested, warn the user about permanent data loss and ask for their consent first.',
  parameters: DeleteArtifactParamsSchema,
  confirmationPolicy: 'never',

  summarizeArgs: (args) => JSON.stringify({ path: args.path }),

  async execute(args, context): Promise<DeleteArtifactResult> {
    const target = resolveChuckPath(context.cwd, args.path, 'artifact');

    if (!existsSync(target.resolvedPath)) {
      throw new Error(`Artifact "${target.displayPath}" does not exist.`);
    }

    const stat = statSync(target.resolvedPath);
    if (stat.isDirectory()) {
      rmSync(target.resolvedPath, { recursive: true, force: true });
    } else {
      unlinkSync(target.resolvedPath);
    }

    return {
      path: target.displayPath,
      message: `Deleted artifact "${target.displayPath}"`,
    };
  },

  summarize: (args, result) => {
    return result ? result.message : `delete_artifact(${args.path})`;
  },
};
