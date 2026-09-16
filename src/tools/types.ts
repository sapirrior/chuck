import type { z } from 'zod';
import type { MutationCheckpointTracker, MutationLockManager } from '../checkpoint/index.js';

/**
 * Execution context passed to tools during execution.
 */
export interface ToolContext {
  cwd: string;
  abortSignal?: AbortSignal;
  checkpointTracker?: MutationCheckpointTracker;
  mutationLocks?: MutationLockManager;
}

/**
 * Clean, extensible tool definition contract.
 */
export interface ToolDefinition<TParams extends z.ZodTypeAny = z.ZodTypeAny, TResult = unknown> {
  name: string;
  displayName: string;
  icon?: string;
  description: string;
  parameters: TParams;

  /**
   * Confirmation policy for the tool. Defaults to 'never'.
   */
  confirmationPolicy?: 'never';

  /**
   * Bounded summary of arguments for logging and session records.
   */
  summarizeArgs?: (args: z.infer<TParams>) => string;

  /**
   * Main tool execution function.
   */
  execute: (args: z.infer<TParams>, context: ToolContext) => Promise<TResult>;

  /**
   * Concise single-line summary of the tool invocation for terminal logs.
   */
  summarize?: (args: z.infer<TParams>, result?: TResult) => string;
}
