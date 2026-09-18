import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import type { ShellTaskReadResult } from '../../services/tasks/types.js';

export const taskReadInputSchema = z.object({
  task_id: z.string().min(1).describe('The ID of the shell task to read (e.g. task-abc12345).'),
});

export type TaskReadInput = z.infer<typeof taskReadInputSchema>;

export const taskReadTool: ToolDefinition<typeof taskReadInputSchema, ShellTaskReadResult> = {
  name: 'task_read',
  displayName: 'Task Read',
  description:
    'Reads current status, exit code, and recent bounded output snapshot of a background shell task. Non-blocking.',
  parameters: taskReadInputSchema,
  confirmationPolicy: 'never',

  summarize: (args, result) => {
    return `└ Task ${args.task_id} · status: ${result?.status ?? 'unknown'}`;
  },

  execute: async (args, context) => {
    if (!context.shellTasks) {
      throw new Error('No shell tasks manager available in execution context.');
    }
    return context.shellTasks.read(args.task_id);
  },
};
