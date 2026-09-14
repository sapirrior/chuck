import { existsSync, unlinkSync, rmSync, statSync } from 'node:fs';
import { z } from 'zod';
import { resolveChuckPath } from '../chuck-paths.js';
import type { ToolDefinition } from '../types.js';

export const DeletePlanParamsSchema = z.object({
  path: z
    .string()
    .optional()
    .describe(
      'Relative path of the plan file inside .chuck/plans/ to delete (defaults to "plan.md")',
    ),
});

export type DeletePlanParams = z.infer<typeof DeletePlanParamsSchema>;

export interface DeletePlanResult {
  path: string;
  message: string;
}

export const deletePlanTool: ToolDefinition<typeof DeletePlanParamsSchema, DeletePlanResult> = {
  name: 'delete_plan',
  displayName: 'Delete Plan',
  icon: '🗑',
  description:
    'Permanently deletes a plan file inside .chuck/plans/. CRITICAL: Only call this tool when the user has explicitly requested deletion. If not explicitly requested, warn the user about permanent data loss and ask for their consent first.',
  parameters: DeletePlanParamsSchema,
  confirmationPolicy: 'never',

  summarizeArgs: (args) => JSON.stringify({ path: args.path || 'plan.md' }),

  async execute(args, context): Promise<DeletePlanResult> {
    const planRelative = args.path && args.path.trim() ? args.path.trim() : 'plan.md';
    const target = resolveChuckPath(context.cwd, planRelative, 'plan');

    if (!existsSync(target.resolvedPath)) {
      throw new Error(`Plan "${target.displayPath}" does not exist.`);
    }

    const stat = statSync(target.resolvedPath);
    if (stat.isDirectory()) {
      rmSync(target.resolvedPath, { recursive: true, force: true });
    } else {
      unlinkSync(target.resolvedPath);
    }

    return {
      path: target.displayPath,
      message: `Deleted plan "${target.displayPath}"`,
    };
  },

  summarize: (args, result) => {
    return result ? result.message : `delete_plan(${args.path || 'plan.md'})`;
  },
};
