import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ModelSelection } from '../engine/types.js';
import {
  SESSION_SCHEMA_VERSION,
  type SessionData,
  type SessionSummary,
  type SessionTurn,
} from './types.js';
import { parseSessionDocument } from './validate.js';

/**
 * Resolves the base root directory for sessions: ~/.steward/sessions (or overridden by STEWARD_SESSIONS_DIR)
 */
export function getSessionsRootDir(): string {
  if (process.env.STEWARD_SESSIONS_DIR) {
    return process.env.STEWARD_SESSIONS_DIR;
  }
  return join(homedir(), '.steward', 'sessions');
}

/**
 * Returns current date formatted as YYYY-MM-DD.
 */
export function getCurrentDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generates an alphanumeric session ID.
 */
export function generateSessionId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}

/**
 * Resolves the full file path for a session: ~/.steward/sessions/<date>/<sessionId>.json
 */
export function getSessionFilePath(date: string, sessionId: string): string {
  return join(getSessionsRootDir(), date, `${sessionId}.json`);
}

/**
 * Creates a new, unpersisted session document.
 */
export function createSession(model: ModelSelection, customId?: string): SessionData {
  const id = customId || generateSessionId();
  const now = new Date().toISOString();
  const date = getCurrentDateString();

  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id,
    name: 'New Session',
    date,
    createdAt: now,
    updatedAt: now,
    model,
    totalUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    turns: [],
  };
}

/**
 * Quarantines a corrupted or malformed session file into ~/.steward/sessions/<date>/.quarantine/<id>.json
 */
export function quarantineSessionFile(filePath: string, dateDir: string, fileName: string): string {
  const quarantineDir = join(dateDir, '.quarantine');
  if (!existsSync(quarantineDir)) {
    mkdirSync(quarantineDir, { recursive: true });
  }
  const quarantinedPath = join(quarantineDir, fileName);
  try {
    renameSync(filePath, quarantinedPath);
  } catch {
    // If rename fails (e.g. cross-device), try copy + remove
    try {
      const content = readFileSync(filePath);
      writeFileSync(quarantinedPath, content);
      unlinkSync(filePath);
    } catch {}
  }
  return quarantinedPath;
}

/**
 * Persists or updates a session JSON file atomically at ~/.steward/sessions/<date>/<sessionId>.json.
 * Uses temp-file + fsync + atomic rename to prevent file corruption.
 */
export function saveSession(session: SessionData): string {
  session.schemaVersion = SESSION_SCHEMA_VERSION;
  session.date = session.date || getCurrentDateString();
  const dateDir = join(getSessionsRootDir(), session.date);
  if (!existsSync(dateDir)) {
    mkdirSync(dateDir, { recursive: true });
  }

  session.updatedAt = new Date().toISOString();

  const targetPath = getSessionFilePath(session.date, session.id);
  const tmpPath = `${targetPath}.tmp-${randomUUID().slice(0, 8)}`;
  const payload = JSON.stringify(session, null, 2) + '\n';

  let fd: number | null = null;
  try {
    fd = openSync(tmpPath, 'w', 0o600);
    writeSync(fd, payload, 0, 'utf-8');
    fsyncSync(fd);
    closeSync(fd);
    fd = null;

    renameSync(tmpPath, targetPath);
    return targetPath;
  } catch (err) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {}
    }
    if (existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath);
      } catch {}
    }
    throw err;
  }
}

/**
 * Appends a completed turn to a session and writes the update to disk.
 * Sets the session name to the first user message if this is the initial turn and it has not been renamed.
 */
export function recordSessionTurn(
  session: SessionData,
  turnData: Omit<SessionTurn, 'id' | 'timestamp'> & { id?: string; timestamp?: string },
): SessionData {
  const turn: SessionTurn = {
    id: turnData.id || randomUUID(),
    timestamp: turnData.timestamp || new Date().toISOString(),
    ...turnData,
  };

  // The first user message becomes the session name only if it hasn't been custom-named
  if (session.turns.length === 0 && (!session.name || session.name === 'New Session')) {
    const firstUserMsg = turnData.messages.find((m) => m.role === 'user');
    if (firstUserMsg) {
      const promptText =
        typeof firstUserMsg.content === 'string'
          ? firstUserMsg.content
          : Array.isArray(firstUserMsg.content)
            ? firstUserMsg.content
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text)
                .join(' ')
            : '';
      if (promptText.trim()) {
        session.name = promptText.trim().slice(0, 100);
      }
    }
  }

  session.turns.push(turn);

  // Accumulate total usage
  session.totalUsage.inputTokens += turn.usage.inputTokens;
  session.totalUsage.outputTokens += turn.usage.outputTokens;
  session.totalUsage.totalTokens += turn.usage.totalTokens;
  if (turn.usage.reasoningTokens) {
    session.totalUsage.reasoningTokens =
      (session.totalUsage.reasoningTokens ?? 0) + turn.usage.reasoningTokens;
  }
  if (turn.usage.cacheReadTokens) {
    session.totalUsage.cacheReadTokens =
      (session.totalUsage.cacheReadTokens ?? 0) + turn.usage.cacheReadTokens;
  }

  saveSession(session);
  return session;
}

/**
 * Renames a session document and persists the update to disk.
 */
export function renameSession(session: SessionData, newName: string): SessionData {
  const trimmed = newName.trim();
  if (!trimmed) {
    throw new Error('Session name cannot be empty.');
  }
  session.name = trimmed;
  saveSession(session);
  return session;
}

/**
 * Loads a session document by session ID (searching all date folders) or by absolute path.
 * Invalid or corrupted files are quarantined and reported rather than silently ignored.
 */
export function loadSession(sessionIdOrPath: string): SessionData | null {
  // If it's an existing absolute/relative path
  if (existsSync(sessionIdOrPath) && sessionIdOrPath.endsWith('.json')) {
    try {
      const raw = readFileSync(sessionIdOrPath, 'utf-8');
      const parseRes = parseSessionDocument(raw);
      if (parseRes.ok) {
        return parseRes.doc;
      }
      // Quarantine corrupted file
      const dir = dirname(sessionIdOrPath);
      const fileName = sessionIdOrPath.split('/').pop() || 'unknown.json';
      quarantineSessionFile(sessionIdOrPath, dir, fileName);
      return null;
    } catch {
      return null;
    }
  }

  // Otherwise search date directories in ~/.steward/sessions
  const rootDir = getSessionsRootDir();
  if (!existsSync(rootDir)) {
    return null;
  }

  const dateDirs = readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name);

  for (const date of dateDirs) {
    const filePath = getSessionFilePath(date, sessionIdOrPath);
    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const parseRes = parseSessionDocument(raw);
        if (parseRes.ok) {
          const doc = parseRes.doc;
          if (!doc.date) {
            doc.date = date;
          }
          return doc;
        }
        // Quarantine invalid/corrupted file
        quarantineSessionFile(filePath, join(rootDir, date), `${sessionIdOrPath}.json`);
        return null;
      } catch {
        return null;
      }
    }
  }

  return null;
}

/**
 * Discovers and lists all saved sessions across all date folders, sorted by most recently updated.
 */
export function listSessions(limit = 50): SessionSummary[] {
  const rootDir = getSessionsRootDir();
  if (!existsSync(rootDir)) {
    return [];
  }

  const dateDirs = readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name);

  const summaries: SessionSummary[] = [];

  for (const date of dateDirs) {
    const datePath = join(rootDir, date);
    let files: string[] = [];
    try {
      files = readdirSync(datePath).filter((f) => f.endsWith('.json') && !f.startsWith('.'));
    } catch {
      continue;
    }

    for (const file of files) {
      const fullPath = join(datePath, file);
      try {
        const raw = readFileSync(fullPath, 'utf-8');
        const parseRes = parseSessionDocument(raw);

        if (parseRes.ok) {
          const doc = parseRes.doc;
          summaries.push({
            id: doc.id,
            name: doc.name || 'Untitled Session',
            date: doc.date || date,
            createdAt: doc.createdAt || new Date().toISOString(),
            updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
            model: doc.model,
            totalTokens: doc.totalUsage?.totalTokens ?? 0,
            turnCount: doc.turns?.length ?? 0,
            filePath: fullPath,
          });
        } else {
          // Quarantine invalid/corrupted file
          quarantineSessionFile(fullPath, datePath, file);
        }
      } catch {
        // Skip inaccessible files
      }
    }
  }

  // Sort by updatedAt descending (newest first)
  summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return summaries.slice(0, limit);
}

/**
 * Deletes a session by searching date folders for the session ID.
 */
export function deleteSession(sessionId: string): boolean {
  const rootDir = getSessionsRootDir();
  if (!existsSync(rootDir)) {
    return false;
  }

  const dateDirs = readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name);

  for (const date of dateDirs) {
    const filePath = getSessionFilePath(date, sessionId);
    if (existsSync(filePath)) {
      try {
        rmSync(filePath);
        return true;
      } catch {
        return false;
      }
    }
  }

  return false;
}
