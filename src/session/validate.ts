import { migrateSessionDocument } from './migrate.js';
import {
  SESSION_SCHEMA_VERSION,
  SessionDocumentV2Schema,
  type SessionDocumentV2,
} from './schema.js';

export type ParseSessionResult =
  | { ok: true; doc: SessionDocumentV2 }
  | { ok: false; reason: 'invalid-json' | 'schema-mismatch' | 'unknown-version'; raw: string };

/**
 * Validates and parses raw session JSON content into SessionDocumentV2.
 * Migrates legacy schema versions automatically.
 */
export function parseSessionDocument(raw: string): ParseSessionResult {
  let parsedJson: any;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid-json', raw };
  }

  if (!parsedJson || typeof parsedJson !== 'object') {
    return { ok: false, reason: 'schema-mismatch', raw };
  }

  // Future schema versions not yet supported
  if (
    typeof parsedJson.schemaVersion === 'number' &&
    parsedJson.schemaVersion > SESSION_SCHEMA_VERSION
  ) {
    return { ok: false, reason: 'unknown-version', raw };
  }

  try {
    // If legacy v1 or unversioned, migrate first
    const candidate =
      parsedJson.schemaVersion === SESSION_SCHEMA_VERSION
        ? parsedJson
        : migrateSessionDocument(parsedJson);

    const validation = SessionDocumentV2Schema.safeParse(candidate);
    if (validation.success) {
      return { ok: true, doc: validation.data as SessionDocumentV2 };
    }
    return { ok: false, reason: 'schema-mismatch', raw };
  } catch {
    return { ok: false, reason: 'schema-mismatch', raw };
  }
}
