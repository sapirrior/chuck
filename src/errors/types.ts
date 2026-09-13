export type ErrorCategory =
  | 'auth'
  | 'forbidden'
  | 'rate-limit'
  | 'overload'
  | 'server-error'
  | 'model-not-found'
  | 'context-length'
  | 'validation'
  | 'network'
  | 'aborted'
  | 'tool-error'
  | 'unknown';

export interface StructuredError {
  category: ErrorCategory;
  statusCode?: number;
  code?: string;
  shortMessage: string;
  isRetryable: boolean;
  suggestedAction?: string;
  retryAfterSec?: number;
  originalError?: unknown;
}
