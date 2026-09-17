import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import { evaluateBashPermission } from './permissions.js';
import { execShellCommand } from './shell.js';

export const bashInputSchema = z.object({
  command: z.string().min(1).describe('The command to execute in the system shell.'),
  explanation: z
    .string()
    .min(1)
    .max(240)
    .describe(
      'Brief sentence explaining why this command is needed (displayed in permission prompt).',
    ),
  timeout: z
    .number()
    .int()
    .min(10, { message: 'timeout must be between 10 and 1800 seconds' })
    .max(1800, { message: 'timeout must be between 10 and 1800 seconds' })
    .optional()
    .describe(
      'Optional command timeout in seconds (minimum 10s, maximum 1800s / 30m, default 120s).',
    ),
});

export type BashInput = z.infer<typeof bashInputSchema>;

export interface BashOutput {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Bash Execution Tool:
 * - Executes commands through the platform-native shell.
 * - Safe read-only commands run without confirmation; potentially mutating or unknown commands require user approval.
 * - Non-checkpointed: Bash mutations do NOT participate in /rewind checkpoints.
 */
export const bashTool: ToolDefinition<typeof bashInputSchema, BashOutput> = {
  name: 'bash',
  displayName: 'Bash',
  description:
    'Executes a command in the platform shell. Use only when shell execution is genuinely necessary. Safe read-only commands run automatically; mutating commands require confirmation. Note: Bash commands are NOT tracked by the file checkpoint system (/rewind).',
  parameters: bashInputSchema,
  confirmationPolicy: 'never',

  summarize: (_args, result) => {
    const code = result?.exitCode ?? 0;
    return `└ Ran successfully · exit code: ${code}`;
  },

  execute: async (args, context) => {
    const command = args.command.trim();
    const explanation = args.explanation.trim();
    const timeout = args.timeout ?? 120;

    // Validate timeout bounds explicitly
    if (timeout < 10 || timeout > 1800) {
      throw new Error('timeout must be between 10 and 1800 seconds');
    }

    if (!explanation) {
      throw new Error('An explanation is required for running a bash command.');
    }

    // Permission evaluation
    const perm = await evaluateBashPermission({ command, explanation }, context);
    if (!perm.allowed) {
      throw new Error(perm.reason || 'Permission denied.');
    }

    // Execute through child process
    const result = await execShellCommand({
      command,
      cwd: context.cwd,
      timeoutSeconds: timeout,
      abortSignal: context.abortSignal,
    });

    if (result.timedOut) {
      throw new Error(`Command timed out after ${timeout} seconds.`);
    }

    if (result.exitCode !== 0) {
      const errDetail = result.stderr.trim() || result.stdout.trim();
      const codeStr = result.exitCode !== null ? `exit code ${result.exitCode}` : 'termination';
      throw new Error(`Command failed with ${codeStr}${errDetail ? `: ${errDetail}` : ''}`);
    }

    return result;
  },
};

export * from './command-policy.js';
export * from './permissions.js';
export * from './shell.js';
