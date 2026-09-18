import type { z } from 'zod';
import type {
  MutationCheckpointTracker,
  MutationLockManager,
} from '../services/checkpoint/index.js';
import type { ShellTaskManager } from '../services/tasks/manager.js';

export interface BashPermissionRequest {
  command: string;
  explanation: string;
}

export interface BashPermissionResponse {
  allowed: boolean;
}

export type FilePermissionKind = 'create' | 'overwrite' | 'edit';

export interface FilePermissionRequest {
  kind: FilePermissionKind;
  filePath: string;
  before: string | null;
  after: string;
}

export interface FilePermissionResponse {
  allowed: boolean;
}

/**
 * Execution context passed to tools during execution.
 */
export interface ToolContext {
  cwd: string;
  abortSignal?: AbortSignal;
  checkpointTracker?: MutationCheckpointTracker;
  mutationLocks?: MutationLockManager;
  requestBashPermission?: (req: BashPermissionRequest) => Promise<BashPermissionResponse>;
  requestFilePermission?: (req: FilePermissionRequest) => Promise<FilePermissionResponse>;
  shellTasks?: ShellTaskManager;
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
