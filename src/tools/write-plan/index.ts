import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { resolveChuckPath } from '../chuck-paths.js';
import type { ToolDefinition } from '../types.js';

export const WritePlanParamsSchema = z.object({
  path: z
    .string()
    .optional()
    .describe('Relative path for the plan file inside .chuck/plans/ (defaults to "plan.md")'),
  content: z.string().describe('Full markdown text content of the plan'),
});

export type WritePlanParams = z.infer<typeof WritePlanParamsSchema>;

export interface WritePlanResult {
  path: string;
  linesWritten: number;
  bytesWritten: number;
  message: string;
}

export const writePlanTool: ToolDefinition<typeof WritePlanParamsSchema, WritePlanResult> = {
  name: 'write_plan',
  displayName: 'Write Plan',
  icon: '📋',
  description:
    'Writes an architectural, implementation, or investigation plan into .chuck/plans/ (defaults to .chuck/plans/plan.md).',
  parameters: WritePlanParamsSchema,
  confirmationPolicy: 'never',

  summarizeArgs: (args) => JSON.stringify({ path: args.path || 'plan.md' }),

  async execute(args, context): Promise<WritePlanResult> {
    const planRelative = args.path && args.path.trim() ? args.path.trim() : 'plan.md';
    const { resolvedPath, displayPath } = resolveChuckPath(context.cwd, planRelative, 'plan');
    const content = args.content ?? '';
    const bytesWritten = Buffer.byteLength(content, 'utf-8');
    const linesWritten = content ? content.split(/\r?\n/).length : 0;

    writeFileSync(resolvedPath, content, 'utf-8');

    return {
      path: displayPath,
      linesWritten,
      bytesWritten,
      message: `Wrote plan with ${linesWritten} lines to ${displayPath}`,
    };
  },

  summarize: (args, result) => {
    return result ? result.message : `write_plan(${args.path || 'plan.md'})`;
  },
};
