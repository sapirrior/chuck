import { z } from 'zod';
import type { ConfirmationRequest, ToolDefinition } from '../types.js';
import { executeShellCommand } from '../../shell/index.js';

export const runCommandInputSchema = z.object({
  command: z.string().describe('The command to execute in the system shell.'),
  timeout_ms: z
    .number()
    .int()
    .min(1000)
    .max(300000)
    .optional()
    .describe('Optional execution timeout in milliseconds. Defaults to 30000 (30s).'),
});

export type RunCommandInput = z.infer<typeof runCommandInputSchema>;

export interface RunCommandOutput {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
  recentLines?: string[];
  totalLines?: number;
  durationMs: number;
}

/**
 * Bash Execution Tool:
 * - Executes shell commands via real-time stream runner in the project directory.
 * - Requires user confirmation unless pre-allowed for the session.
 * - Streams execution time and returns exitCode, stdout, and stderr.
 */
export const runCommandTool: ToolDefinition<typeof runCommandInputSchema, RunCommandOutput> = {
  name: 'run_command',
  displayName: 'Bash',
  description:
    'Executes shell commands in the local system environment. Use for running tests, build scripts, git operations, or CLI utilities.',
  parameters: runCommandInputSchema,
  confirmationPolicy: 'session',

  getConfirmationRequest: (args: RunCommandInput): ConfirmationRequest => {
    return {
      toolName: 'run_command',
      displayName: 'Bash',
      promptTitle: `Execute command: ${args.command}`,
      args: {
        command: args.command,
      },
    };
  },

  summarize: (args) => {
    return `run_command(${args.command})`;
  },

  execute: async (args, context) => {
    const timeout = args.timeout_ms ?? 30000;

    const result = await executeShellCommand({
      command: args.command,
      cwd: context.cwd,
      timeoutMs: timeout,
      abortSignal: context.abortSignal,
      maxBufferLines: 10,
      onLine: (line, recent) => {
        context.onToolProgress?.(line, recent);
      },
    });

    if (result.exitCode !== 0 && !result.stdout && !result.stderr && result.interrupted) {
      throw new Error(`Command interrupted: ${args.command}`);
    }

    return {
      command: args.command,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      output: result.output,
      recentLines: result.recentLines,
      totalLines: result.totalLines,
      durationMs: result.durationMs,
    };
  },
};
