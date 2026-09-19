import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getSessionsRootDir } from '../store.js';
import {
  SESSION_LOG_SCHEMA_VERSION,
  type LoadedSessionLog,
  type SessionLogEvent,
  type SessionPresentationProjection,
  type SessionTurnPresentation,
} from './types.js';

export const MAX_TOOL_OUTPUT_SUMMARY_CHARS = 16_000;
export const MAX_TOOL_ERROR_CHARS = 4_000;

export const STATUS_VERBS = ['Baked', 'Brewed', 'Churned', 'Swooped', 'Crafted', 'Cooked'] as const;

export function chooseTurnStatusVerb(): string {
  return STATUS_VERBS[Math.floor(Math.random() * STATUS_VERBS.length)] ?? 'Baked';
}

/**
 * Resolves the base root directory for presentation session logs: ~/.steward/session-logs
 * (or derived from STEWARD_SESSIONS_DIR parent directory)
 */
export function getSessionLogsRootDir(): string {
  return join(dirname(getSessionsRootDir()), 'session-logs');
}

/**
 * Resolves the full file path for a session log: ~/.steward/session-logs/<date>/<sessionId>.jsonl
 */
export function getSessionLogPath(date: string, sessionId: string): string {
  return join(getSessionLogsRootDir(), date, `${sessionId}.jsonl`);
}

/**
 * Bounds string length to prevent unbounded log growth.
 */
function boundString(str: string | undefined, maxChars: number): string | undefined {
  if (str === undefined || str === null) return undefined;
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + '…';
}

/**
 * Normalizes log event before writing to guarantee bounds and invariants.
 */
function normalizeEventForPersistence(event: SessionLogEvent): SessionLogEvent {
  if (event.type === 'tool-end') {
    return {
      ...event,
      outputSummary: boundString(event.outputSummary, MAX_TOOL_OUTPUT_SUMMARY_CHARS),
      errorMessage: boundString(event.errorMessage, MAX_TOOL_ERROR_CHARS),
    };
  }
  if (event.type === 'turn-end') {
    return {
      ...event,
      errorMessage: boundString(event.errorMessage, MAX_TOOL_ERROR_CHARS),
    };
  }
  return event;
}

/**
 * Validates a parsed JSON object as a known SessionLogEvent for a specific session.
 */
function isValidSessionLogEvent(obj: any, expectedSessionId: string): obj is SessionLogEvent {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.schemaVersion !== SESSION_LOG_SCHEMA_VERSION) return false;
  if (obj.sessionId !== expectedSessionId) return false;
  if (typeof obj.turnId !== 'string' || !obj.turnId) return false;
  if (typeof obj.timestamp !== 'string') return false;

  const validTypes = ['turn-start', 'tool-start', 'tool-end', 'turn-end'];
  if (!validTypes.includes(obj.type)) return false;

  switch (obj.type) {
    case 'turn-start':
      return typeof obj.startedAt === 'string' && typeof obj.model === 'object' && obj.model !== null;
    case 'tool-start':
      return (
        typeof obj.toolCallId === 'string' &&
        typeof obj.toolName === 'string' &&
        typeof obj.startedAt === 'string'
      );
    case 'tool-end':
      return (
        typeof obj.toolCallId === 'string' &&
        typeof obj.toolName === 'string' &&
        typeof obj.finishedAt === 'string' &&
        (obj.status === 'completed' || obj.status === 'failed')
      );
    case 'turn-end':
      return (
        typeof obj.finishedAt === 'string' &&
        typeof obj.durationMs === 'number' &&
        (obj.status === 'complete' || obj.status === 'interrupted' || obj.status === 'errored')
      );
    default:
      return false;
  }
}

/**
 * Append-only serialized writer for session presentation journals.
 */
export class SessionLogWriter {
  private filePath: string;
  private tail: Promise<void> = Promise.resolve();
  private isClosed = false;

  constructor(date: string, sessionId: string) {
    const dir = join(getSessionLogsRootDir(), date);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.filePath = getSessionLogPath(date, sessionId);
  }

  /**
   * Appends an event to the session log JSONL file.
   * Serialized in-process to guarantee order without interleaving.
   */
  public append(event: SessionLogEvent): Promise<void> {
    if (this.isClosed) {
      return Promise.resolve();
    }

    const normalized = normalizeEventForPersistence(event);
    const line = JSON.stringify(normalized) + '\n';

    this.tail = this.tail.then(() => {
      if (this.isClosed) return;
      try {
        if (!existsSync(this.filePath)) {
          const fd = openSync(this.filePath, 'a', 0o600);
          closeSync(fd);
        }
        appendFileSync(this.filePath, line, 'utf-8');
      } catch {
        // Non-fatal to caller; session log is secondary best-effort
      }
    });

    return this.tail;
  }

  /**
   * Closes the writer after draining in-flight writes.
   */
  public async close(): Promise<void> {
    this.isClosed = true;
    await this.tail;
  }
}

/**
 * Tolerant reader for session presentation logs.
 * Truncated/corrupted lines are ignored without failing earlier complete events.
 */
export function loadSessionLog(date: string, sessionId: string): LoadedSessionLog | null {
  const filePath = getSessionLogPath(date, sessionId);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n');
    const events: SessionLogEvent[] = [];
    let ignoredLines = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed);
        if (isValidSessionLogEvent(parsed, sessionId)) {
          events.push(parsed);
        } else {
          ignoredLines++;
        }
      } catch {
        ignoredLines++;
      }
    }

    return { events, ignoredLines };
  } catch {
    return null;
  }
}

/**
 * Builds an indexed in-memory presentation projection from log events.
 */
export function buildSessionPresentationProjection(
  events: readonly SessionLogEvent[],
): SessionPresentationProjection {
  const turns = new Map<string, SessionTurnPresentation>();

  for (const event of events) {
    let turn = turns.get(event.turnId);
    if (!turn) {
      turn = { tools: new Map() };
      turns.set(event.turnId, turn);
    }

    switch (event.type) {
      case 'turn-start':
        turn.start = event;
        break;
      case 'tool-end':
        turn.tools.set(event.toolCallId, event);
        break;
      case 'turn-end':
        turn.end = event;
        break;
      case 'tool-start':
        // Tool starts are tracked for in-flight inspection; tool-end completes it
        break;
    }
  }

  return { turns };
}

/**
 * Deletes a session presentation log if it exists. Best-effort.
 */
export function removeSessionLog(date: string, sessionId: string): void {
  try {
    const filePath = getSessionLogPath(date, sessionId);
    if (existsSync(filePath)) {
      rmSync(filePath);
    }
  } catch {}
}
