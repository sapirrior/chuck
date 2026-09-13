export type ToolCallStatus =
  | 'requested'
  | 'awaiting-approval'
  | 'approved'
  | 'denied'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted';

/**
 * Normalized canonical representation of a tool call throughout its entire lifecycle.
 */
export interface ToolCallRecord {
  id: string; // stable, from chunk.toolCallId / provider
  name: string;
  status: ToolCallStatus;
  argsSummary: string; // bounded, tool-specific
  startedAt?: number;
  durationMs?: number;
  isError: boolean;
  resultPreview?: string; // bounded
  resultTruncated: boolean;
}
