import type { ModelSelection } from '../engine/types.js';
import type {
  SessionDocumentV2,
  SessionTurnV2,
  ToolCallSummary,
} from './schema.js';

export {
  SESSION_SCHEMA_VERSION,
  type SessionDocumentV2,
  type SessionTurnV2,
  type ToolCallSummary,
} from './schema.js';

/** Canonical session document type */
export type SessionData = SessionDocumentV2;

/** Canonical session turn type */
export type SessionTurn = SessionTurnV2;

/**
 * Lightweight metadata used when listing sessions for /resume.
 */
export interface SessionSummary {
  id: string;
  name: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  model: ModelSelection;
  totalTokens: number;
  turnCount: number;
  filePath: string;
}

export interface QuarantineResult {
  recovered: false;
  reason: 'invalid-json' | 'schema-mismatch' | 'unknown-version';
  quarantinedPath: string;
}

export type LoadSessionResult = SessionDocumentV2 | null;
