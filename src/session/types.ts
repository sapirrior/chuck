import type { ModelSelection } from '../engine/types.js';
import type {
  SessionDocument,
  SessionTurn,
} from './schema.js';

export {
  SESSION_SCHEMA_VERSION,
  type SessionDocument,
  type SessionTurn,
} from './schema.js';

/** Canonical session document type */
export type SessionData = SessionDocument;

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

export type LoadSessionResult = SessionDocument | null;
