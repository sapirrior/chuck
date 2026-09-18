import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const sleepInputSchema = z.object({
  seconds: z
    .number()
    .int()
    .min(1)
    .max(300)
    .describe('Number of seconds to pause agent execution (between 1 and 300 seconds).'),
});

export type SleepInput = z.infer<typeof sleepInputSchema>;

export interface SleepOutput {
  seconds: number;
}

/**
 * Sleep Tool:
 * - Pauses the current agent execution for a specified duration (1 to 300s).
 * - Cancellable via context.abortSignal.
 * - Read-only, no checkpointing.
 */
export const sleepTool: ToolDefinition<typeof sleepInputSchema, SleepOutput> = {
  name: 'sleep',
  displayName: 'Sleep',
  description:
    'Pauses current agent execution temporarily (between 1 and 300 seconds). Read-only and cancellable.',
  parameters: sleepInputSchema,
  confirmationPolicy: 'never',

  summarize: (_args, result) => {
    const s = result?.seconds ?? _args.seconds ?? 0;
    return `Slept for ${s} second${s === 1 ? '' : 's'}`;
  },

  execute: async (args, context) => {
    const seconds = args.seconds;
    const ms = seconds * 1000;

    await new Promise<void>((resolve, reject) => {
      if (context.abortSignal?.aborted) {
        return reject(new Error('Sleep cancelled'));
      }

      const timer = setTimeout(() => {
        if (context.abortSignal) {
          context.abortSignal.removeEventListener('abort', onAbort);
        }
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('Sleep cancelled'));
      };

      if (context.abortSignal) {
        context.abortSignal.addEventListener('abort', onAbort, { once: true });
      }
    });

    return {
      seconds,
    };
  },
};
