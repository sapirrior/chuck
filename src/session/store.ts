import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ModelSelection } from '../engine/types.js';
import type { SessionData, SessionSummary, SessionTurn } from './types.js';

/**
 * Resolves the base root directory for sessions: ~/.xd/sessions
 */
export function getSessionsRootDir(): string {
  return join(homedir(), '.xd', 'sessions');
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
 * Resolves the full file path for a session: ~/.xd/sessions/<date>/<sessionId>.json
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
 * Persists or updates a session JSON file at ~/.xd/sessions/<date>/<sessionId>.json.
 * Does not write system prompts, and preserves all tool calls and outputs.
 */
export function saveSession(session: SessionData): string {
  session.date = session.date || getCurrentDateString();
  const dateDir = join(getSessionsRootDir(), session.date);
  if (!existsSync(dateDir)) {
    mkdirSync(dateDir, { recursive: true });
  }

  session.updatedAt = new Date().toISOString();

  const filePath = getSessionFilePath(session.date, session.id);
  writeFileSync(filePath, JSON.stringify(session, null, 2) + '\n', 'utf-8');
  return filePath;
}

/**
 * Appends a completed turn to a session and writes the update to disk.
 * Sets the session name to the first user message if this is the initial turn and it has not been renamed.
 */
export function recordSessionTurn(
  session: SessionData,
  turnData: Omit<SessionTurn, 'id' | 'timestamp'>,
): SessionData {
  const turn: SessionTurn = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...turnData,
  };

  // The first user message becomes the session name only if it hasn't been custom-named
  if (
    session.turns.length === 0 &&
    turnData.userPrompt &&
    (!session.name || session.name === 'New Session')
  ) {
    session.name = turnData.userPrompt.slice(0, 100).trim();
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
 */
export function loadSession(sessionIdOrPath: string): SessionData | null {
  // If it's an existing absolute/relative path
  if (existsSync(sessionIdOrPath) && sessionIdOrPath.endsWith('.json')) {
    try {
      const raw = readFileSync(sessionIdOrPath, 'utf-8');
      const doc = JSON.parse(raw) as SessionData;
      if (!doc.date) {
        doc.date = getCurrentDateString();
      }
      return doc;
    } catch {
      return null;
    }
  }

  // Otherwise search date directories in ~/.xd/sessions
  const rootDir = getSessionsRootDir();
  if (!existsSync(rootDir)) {
    return null;
  }

  const dateDirs = readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const date of dateDirs) {
    const filePath = getSessionFilePath(date, sessionIdOrPath);
    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const doc = JSON.parse(raw) as SessionData;
        if (!doc.date) {
          doc.date = date;
        }
        return doc;
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
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const summaries: SessionSummary[] = [];

  for (const date of dateDirs) {
    const datePath = join(rootDir, date);
    let files: string[] = [];
    try {
      files = readdirSync(datePath).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }

    for (const file of files) {
      const fullPath = join(datePath, file);
      try {
        const raw = readFileSync(fullPath, 'utf-8');
        const doc = JSON.parse(raw) as Partial<SessionData>;

        if (doc.id && doc.model) {
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
        }
      } catch {
        // Skip unparseable files
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
    .filter((d) => d.isDirectory())
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
