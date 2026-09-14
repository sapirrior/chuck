import { SESSION_SCHEMA_VERSION, SessionDocumentSchema, type SessionDocument } from './schema.js';

export type ParseSessionResult =
  | { ok: true; doc: SessionDocument }
  | { ok: false; reason: 'invalid-json' | 'schema-mismatch' | 'unknown-version'; raw: string };

/**
 * Validates and parses raw session JSON content into SessionDocument.
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

  // Ensure schemaVersion is 1
  if (parsedJson.schemaVersion !== SESSION_SCHEMA_VERSION) {
    // If unversioned, default schemaVersion to 1
    if (parsedJson.schemaVersion === undefined) {
      parsedJson.schemaVersion = SESSION_SCHEMA_VERSION;
    } else {
      return { ok: false, reason: 'unknown-version', raw };
    }
  }

  // Normalize turns messages if necessary
  if (Array.isArray(parsedJson.turns)) {
    for (const turn of parsedJson.turns) {
      if (!Array.isArray(turn.messages)) {
        turn.messages = [];
      }
    }
  }

  const validation = SessionDocumentSchema.safeParse(parsedJson);
  if (validation.success) {
    return { ok: true, doc: validation.data as SessionDocument };
  }

  return { ok: false, reason: 'schema-mismatch', raw };
}
