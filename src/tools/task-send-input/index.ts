import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import type { ShellTaskSendInputResult } from '../../services/tasks/types.js';

export const taskSendInputSchema = z.object({
  task_id: z.string().min(1).describe('The ID of the shell task to send input to.'),
  input: z.string().describe('The text to write to standard input (stdin).'),
  append_newline: z
    .boolean()
    .optional()
    .describe(
      'Whether to ensure a trailing newline (\\n) is sent so the command receives Enter. Defaults to true.',
    ),
});

export type TaskSendInput = z.infer<typeof taskSendInputSchema>;

/**
 * Normalizes input text by unescaping literal escape sequences and ensuring trailing newline if requested.
 */
export function normalizeStdinInput(rawInput: string, appendNewline = true): string {
  let normalized = rawInput
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');

  if (appendNewline && !normalized.endsWith('\n') && !normalized.endsWith('\r')) {
    normalized += '\n';
  }

  return normalized;
}

export const taskSendInputTool: ToolDefinition<
  typeof taskSendInputSchema,
  ShellTaskSendInputResult
> = {
  name: 'task_send_input',
  displayName: 'Task Send Input',
  description:
    'Writes input text to the standard input (stdin) of a running background shell task. Automatically appends a newline unless append_newline is set to false.',
  parameters: taskSendInputSchema,
  confirmationPolicy: 'never',

  summarize: (args) => {
    return `└ Sent input to ${args.task_id} (${args.input.length} chars)`;
  },

  execute: async (args, context) => {
    if (!context.shellTasks) {
      throw new Error('No shell tasks manager available in execution context.');
    }

    const shouldAppend = args.append_newline ?? true;
    const finalInput = normalizeStdinInput(args.input, shouldAppend);

    return context.shellTasks.sendInput(args.task_id, finalInput);
  },
};
