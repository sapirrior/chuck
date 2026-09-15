import { existsSync, renameSync } from 'node:fs';
import { z } from 'zod';
import { resolveSafePath } from '../safe-paths.js';
import type { ToolDefinition } from '../types.js';

export const RenamePlanParamsSchema = z.object({
  old_path: z
    .string()
    .optional()
    .describe('Existing relative path of the plan inside .steward/plans/ (defaults to "plan.md")'),
  new_path: z.string().describe('New relative path for the plan inside .steward/plans/'),
});

export type RenamePlanParams = z.infer<typeof RenamePlanParamsSchema>;

export interface RenamePlanResult {
  oldPath: string;
  newPath: string;
  message: string;
}

export const renamePlanTool: ToolDefinition<typeof RenamePlanParamsSchema, RenamePlanResult> = {
  name: 'rename_plan',
  displayName: 'Rename Plan',
  icon: '🔀',
  description:
    'Renames or moves a plan file inside .steward/plans/. CRITICAL: Only call this tool when the user has explicitly requested to rename/move a plan. If not explicitly requested, warn the user first and ask for their consent.',
  parameters: RenamePlanParamsSchema,
  confirmationPolicy: 'never',

  summarizeArgs: (args) =>
    JSON.stringify({ old_path: args.old_path || 'plan.md', new_path: args.new_path }),

  async execute(args, context): Promise<RenamePlanResult> {
    const oldRelative = args.old_path && args.old_path.trim() ? args.old_path.trim() : 'plan.md';
    const source = resolveSafePath(context.cwd, oldRelative, 'plan');
    const destination = resolveSafePath(context.cwd, args.new_path, 'plan');

    if (!existsSync(source.resolvedPath)) {
      throw new Error(`Plan "${source.displayPath}" does not exist.`);
    }

    renameSync(source.resolvedPath, destination.resolvedPath);

    return {
      oldPath: source.displayPath,
      newPath: destination.displayPath,
      message: `Renamed plan from "${source.displayPath}" to "${destination.displayPath}"`,
    };
  },

  summarize: (args, result) => {
    return result
      ? result.message
      : `rename_plan(${args.old_path || 'plan.md'} -> ${args.new_path})`;
  },
};
