import type { z } from 'zod';
import type { DiffLine } from '../utils/diff.js';

/**
 * Confirmation policy indicating how user approval is requested:
 * - 'never': Read-only safe tools (read_file, web_fetch)
 * - 'session': Mutating tools that can be approved for the entire session once (bash, edit_file)
 * - 'always': Dangerous tools that must always require individual confirmation
 */
export type ConfirmationPolicy = 'never' | 'session' | 'always';

/**
 * Decision returned when asking user for confirmation.
 */
export type ConfirmationDecision = 'allow_once' | 'allow_session' | 'deny';

/**
 * Bounded, type-safe confirmation preview structure.
 */
export type ConfirmationPreview =
  | {
      kind: 'edit';
      path: string;
      statsOnly: { addedLines: number; removedLines: number };
      smallPreviewDiffLines?: DiffLine[];
    }
  | {
      kind: 'write';
      path: string;
      isNewFile: boolean;
      totalLines: number;
      bytesWritten: number;
      smallPreviewLines?: string[];
    }
  | {
      kind: 'command';
      command: string;
      totalLines: number;
    }
  | {
      kind: 'custom';
      details: string;
    };

/**
 * Information presented to the user when requesting approval for a tool execution.
 */
export interface ConfirmationRequest {
  toolName: string;
  displayName: string;
  promptTitle: string;
  preview: ConfirmationPreview;
  reviewToken: string;
  /** Legacy/generic arguments bag for backwards-compatibility */
  args?: Record<string, unknown>;
  previewDetails?: string;
}

/**
 * Execution context passed to tools during execution.
 */
export interface ToolContext {
  cwd: string;
  abortSignal?: AbortSignal;
  /**
   * Asks the user/UI for interactive confirmation before running a mutating tool.
   */
  requestConfirmation?: (request: ConfirmationRequest) => Promise<ConfirmationDecision>;
  /**
   * Session-scoped allowlist of pre-approved tool names.
   */
  sessionAllowlist?: Set<string>;
  /**
   * Callback invoked when a user declines/denies a tool permission request.
   */
  onDeny?: () => void;
  /**
   * Real-time progress callback for streaming tool outputs (such as bash output lines).
   */
  onToolProgress?: (chunk: string, recentLines: string[]) => void;
}

/**
 * Clean, extensible tool definition contract with first-class confirmation support.
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
  confirmationPolicy?: ConfirmationPolicy;

  /**
   * Determines if confirmation is required for a specific invocation.
   */
  needsConfirmation?: (args: z.infer<TParams>) => boolean;

  /**
   * Generates a human-friendly confirmation preview for the UI.
   */
  getConfirmationRequest?: (args: z.infer<TParams>) => ConfirmationRequest;

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
