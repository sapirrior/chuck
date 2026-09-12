import { exec } from 'node:child_process';
import { z } from 'zod';
import type { ConfirmationRequest, ToolDefinition } from '../types.js';

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
  durationMs: number;
}

/**
 * Bash Execution Tool:
 * - Executes shell commands in the project directory.
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
    const startTime = Date.now();

    return new Promise<RunCommandOutput>((resolve, reject) => {
      const child = exec(
        args.command,
        {
          cwd: context.cwd,
          timeout,
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;
          const exitCode = error && typeof error.code === 'number' ? error.code : error ? 1 : 0;

          if (error && !stdout && !stderr) {
            return reject(error);
          }

          resolve({
            command: args.command,
            exitCode,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            durationMs,
          });
        },
      );

      if (context.abortSignal) {
        context.abortSignal.addEventListener('abort', () => {
          child.kill('SIGTERM');
        });
      }
    });
  },
};
