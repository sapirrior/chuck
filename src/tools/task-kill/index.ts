import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import type { ShellTaskKillResult } from '../../services/tasks/types.js';

export const taskKillInputSchema = z.object({
  task_id: z.string().min(1).describe('The ID of the shell task to terminate.'),
});

export type TaskKillInput = z.infer<typeof taskKillInputSchema>;

export const taskKillTool: ToolDefinition<typeof taskKillInputSchema, ShellTaskKillResult> = {
  name: 'task_kill',
  displayName: 'Task Kill',
  description: 'Terminates a running background shell task and its descendant process tree.',
  parameters: taskKillInputSchema,
  confirmationPolicy: 'never',

  summarize: (args, result) => {
    return `Stopped task ${args.task_id} · status: ${result?.status ?? 'killed'}`;
  },

  execute: async (args, context) => {
    if (!context.shellTasks) {
      throw new Error('No shell tasks manager available in execution context.');
    }
    return context.shellTasks.kill(args.task_id);
  },
};
