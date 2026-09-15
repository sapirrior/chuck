import { existsSync, renameSync } from 'node:fs';
import { z } from 'zod';
import { resolveSafePath } from '../safe-paths.js';
import type { ToolDefinition } from '../types.js';

export const RenameArtifactParamsSchema = z.object({
  old_path: z
    .string()
    .describe('Existing relative path of the artifact inside .steward/artifacts/'),
  new_path: z.string().describe('New relative path for the artifact inside .steward/artifacts/'),
});

export type RenameArtifactParams = z.infer<typeof RenameArtifactParamsSchema>;

export interface RenameArtifactResult {
  oldPath: string;
  newPath: string;
  message: string;
}

export const renameArtifactTool: ToolDefinition<
  typeof RenameArtifactParamsSchema,
  RenameArtifactResult
> = {
  name: 'rename_artifact',
  displayName: 'Rename Artifact',
  icon: '🔀',
  description:
    'Renames or moves an existing artifact file inside .steward/artifacts/. CRITICAL: Only call this tool when the user has explicitly requested to rename/move an artifact. If not explicitly requested, warn the user first and ask for their consent.',
  parameters: RenameArtifactParamsSchema,
  confirmationPolicy: 'never',

  summarizeArgs: (args) => JSON.stringify({ old_path: args.old_path, new_path: args.new_path }),

  async execute(args, context): Promise<RenameArtifactResult> {
    const source = resolveSafePath(context.cwd, args.old_path, 'artifact');
    const destination = resolveSafePath(context.cwd, args.new_path, 'artifact');

    if (!existsSync(source.resolvedPath)) {
      throw new Error(`Artifact "${source.displayPath}" does not exist.`);
    }

    renameSync(source.resolvedPath, destination.resolvedPath);

    return {
      oldPath: source.displayPath,
      newPath: destination.displayPath,
      message: `Renamed artifact from "${source.displayPath}" to "${destination.displayPath}"`,
    };
  },

  summarize: (args, result) => {
    return result ? result.message : `rename_artifact(${args.old_path} -> ${args.new_path})`;
  },
};
