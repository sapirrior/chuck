import { rmSync } from 'node:fs';
import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import { ShellExecution } from '../../tasks/process.js';
import { evaluateBashPermission } from './permissions.js';

export const bashInputSchema = z.object({
  command: z.string().min(1).describe('The command to execute in the system shell.'),
  explanation: z
    .string()
    .min(1)
    .max(240)
    .describe(
      'Brief sentence explaining why this command is needed (displayed in permission prompt).',
    ),
});

export type BashInput = z.infer<typeof bashInputSchema>;

export type BashOutput =
  | {
      status?: undefined;
      command: string;
      exitCode: number | null;
      stdout: string;
      stderr: string;
      durationMs: number;
    }
  | {
      status: 'backgrounded';
      taskId: string;
      command: string;
      message: string;
    };

/**
 * Bash Execution Tool:
 * - Executes commands through the platform-native shell.
 * - Safe read-only commands run without confirmation; potentially mutating or unknown commands require user approval.
 * - Commands exceeding the built-in foreground limit (~12s) automatically continue as background shell tasks.
 * - Non-checkpointed: Bash mutations do NOT participate in /rewind checkpoints.
 */
export const bashTool: ToolDefinition<typeof bashInputSchema, BashOutput> = {
  name: 'bash',
  displayName: 'Bash',
  description:
    'Executes a command in the platform shell. Commands that exceed the foreground limit (~12s) automatically continue as background shell tasks. Use task_read, task_send_input, and task_kill to manage background tasks. Note: Bash commands are NOT tracked by the file checkpoint system (/rewind).',
  parameters: bashInputSchema,
  confirmationPolicy: 'never',

  summarize: (_args, result) => {
    if (result && 'status' in result && result.status === 'backgrounded') {
      return `└ Moved to background · task id: ${result.taskId}`;
    }
    const code = (result as any)?.exitCode ?? 0;
    return `└ Ran successfully · exit code: ${code}`;
  },

  execute: async (args, context) => {
    const command = args.command.trim();
    const explanation = args.explanation.trim();

    if (!explanation) {
      throw new Error('An explanation is required for running a bash command.');
    }

    // Permission evaluation
    const perm = await evaluateBashPermission({ command, explanation }, context);
    if (!perm.allowed) {
      throw new Error(perm.reason || 'Permission denied.');
    }

    // Create execution handle with a stable task ID
    const taskId = context.shellTasks
      ? context.shellTasks.generateTaskId()
      : `task-${Date.now().toString(36)}`;

    const execution = new ShellExecution({
      taskId,
      command,
      cwd: context.cwd,
    });

    // Start execution with foreground handoff
    const { foregroundPromise } = execution.start({
      abortSignal: context.abortSignal,
    });

    const outcome = await foregroundPromise;

    if (outcome.outcome === 'backgrounded') {
      // Register in task manager on successful handoff
      context.shellTasks?.register(execution);

      return {
        status: 'backgrounded',
        taskId: execution.taskId,
        command,
        message: `Command moved to background as task ${execution.taskId}`,
      };
    }

    // Foreground completed: cleanup any temporary disk artifact
    try {
      if (execution.outputPath) {
        rmSync(execution.outputPath, { force: true });
      }
    } catch {}

    if (outcome.exitCode !== 0) {
      const errDetail = outcome.stderr.trim() || outcome.stdout.trim();
      const codeStr = outcome.exitCode !== null ? `exit code ${outcome.exitCode}` : 'termination';
      throw new Error(`Command failed with ${codeStr}${errDetail ? `: ${errDetail}` : ''}`);
    }

    return {
      command,
      exitCode: outcome.exitCode,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      durationMs: outcome.durationMs,
    };
  },
};

export * from './command-policy.js';
export * from './permissions.js';
export * from './shell.js';
