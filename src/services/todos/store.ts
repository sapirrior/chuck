import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  openSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getSettingsDir } from '../../config/index.js';
import type { PersistedTodoList, TodoItem, TodoItemStatus } from './types.js';

const VALID_STATUSES: readonly TodoItemStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
  'blocked',
] as const;

const MIN_ITEMS = 2;
const MAX_ITEMS = 10;

/**
 * In-process mutex queue for serializing concurrent mutations per session.
 */
class SessionLockQueue {
  private queues = new Map<string, Promise<unknown>>();

  public async runExclusive<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queues.set(
      sessionId,
      prev.then(
        () => current,
        () => current,
      ),
    );

    try {
      await prev;
      return await task();
    } finally {
      release();
      if (this.queues.get(sessionId) === current) {
        this.queues.delete(sessionId);
      }
    }
  }
}

const sessionLocks = new SessionLockQueue();

/**
 * Validates and sanitizes a sessionId to ensure safe path usage.
 */
export function sanitizeSessionId(sessionId: string): string {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Invalid sessionId: must be a non-empty string');
  }
  const clean = sessionId.trim();
  if (!clean || clean.includes('..') || clean.includes('/') || clean.includes('\\')) {
    throw new Error(`Invalid sessionId for path resolution: "${sessionId}"`);
  }
  return clean;
}

/**
 * Resolves the directory path for a session's todos.
 */
export function getSessionTodosDir(sessionId: string): string {
  const safeId = sanitizeSessionId(sessionId);
  return join(getSettingsDir(), 'todos', safeId);
}

/**
 * Resolves the file path for a session's todos.json.
 */
export function getSessionTodosFilePath(sessionId: string): string {
  return join(getSessionTodosDir(sessionId), 'todos.json');
}

/**
 * Validates the in-memory array of todo items against all business invariants.
 */
export function validateTodoList(todos: unknown): TodoItem[] {
  if (!Array.isArray(todos)) {
    throw new Error('Invalid todos format: expected an array of todo items');
  }

  if (todos.length < MIN_ITEMS || todos.length > MAX_ITEMS) {
    throw new Error(
      `Todo list must contain between ${MIN_ITEMS} and ${MAX_ITEMS} items (received ${todos.length})`,
    );
  }

  const seenIds = new Set<string>();
  let inProgressCount = 0;
  const validated: TodoItem[] = [];

  for (let i = 0; i < todos.length; i++) {
    const item = todos[i];
    if (!item || typeof item !== 'object') {
      throw new Error(`Invalid todo at index ${i}: item must be an object`);
    }

    const { id, description, status } = item as Record<string, unknown>;

    if (typeof id !== 'string' || !id.trim()) {
      throw new Error(`Invalid todo at index ${i}: id must be a non-empty string`);
    }
    const trimmedId = id.trim();
    if (seenIds.has(trimmedId)) {
      throw new Error(`Duplicate todo id "${trimmedId}" at index ${i}`);
    }
    seenIds.add(trimmedId);

    if (typeof description !== 'string' || !description.trim()) {
      throw new Error(
        `Invalid todo at index ${i} (${trimmedId}): description must be a non-empty string`,
      );
    }

    if (typeof status !== 'string' || !VALID_STATUSES.includes(status as TodoItemStatus)) {
      throw new Error(
        `Invalid todo at index ${i} (${trimmedId}): status must be one of ${VALID_STATUSES.join(', ')} (got "${status}")`,
      );
    }

    if (status === 'in_progress') {
      inProgressCount++;
    }

    validated.push({
      id: trimmedId,
      description: description.trim(),
      status: status as TodoItemStatus,
    });
  }

  if (inProgressCount > 1) {
    throw new Error(
      `At most 1 todo item can be 'in_progress' at any time (found ${inProgressCount} in_progress items)`,
    );
  }

  return validated;
}

/**
 * Reads and validates a session's persisted todo list.
 * Returns null if the file does not exist.
 * Throws if the file exists but contains invalid JSON or schema violations.
 */
export async function readTodoList(sessionId: string): Promise<PersistedTodoList | null> {
  const filePath = getSessionTodosFilePath(sessionId);
  if (!existsSync(filePath)) {
    return null;
  }

  const raw = readFileSync(filePath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Corrupted todo state for session "${sessionId}": failed to parse JSON (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Corrupted todo state for session "${sessionId}": root must be an object`);
  }

  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    throw new Error(
      `Unsupported todo schemaVersion "${record.schemaVersion}" (expected 1) for session "${sessionId}"`,
    );
  }

  if (typeof record.sessionId !== 'string') {
    throw new Error(`Invalid todo state for session "${sessionId}": missing or invalid sessionId`);
  }

  const validatedTodos = validateTodoList(record.todos);

  return {
    schemaVersion: 1,
    sessionId: record.sessionId,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    todos: validatedTodos,
  };
}

/**
 * Writes the given todo list atomically to disk with schema validation and serialized locking.
 */
export async function writeTodoList(
  sessionId: string,
  todos: TodoItem[],
): Promise<PersistedTodoList> {
  return sessionLocks.runExclusive(sessionId, async () => {
    const validated = validateTodoList(todos);
    const safeSessionId = sanitizeSessionId(sessionId);
    const dir = getSessionTodosDir(safeSessionId);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    const payload: PersistedTodoList = {
      schemaVersion: 1,
      sessionId: safeSessionId,
      updatedAt: new Date().toISOString(),
      todos: validated,
    };

    const targetPath = getSessionTodosFilePath(safeSessionId);
    const tempPath = join(dir, `.todos.${randomUUID()}.tmp`);

    const jsonStr = JSON.stringify(payload, null, 2) + '\n';

    try {
      writeFileSync(tempPath, jsonStr, { encoding: 'utf-8', mode: 0o600 });
      const fd = openSync(tempPath, 'r');
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(tempPath, targetPath);
    } catch (err) {
      try {
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
        }
      } catch {}
      throw err;
    }

    return payload;
  });
}

/**
 * Updates a single todo item in the session's list.
 * Throws if the list does not exist, item is not found, or invariants are violated.
 */
export async function updateTodoItem(
  sessionId: string,
  todoId: string,
  updates: { status?: TodoItemStatus; description?: string },
): Promise<PersistedTodoList> {
  return sessionLocks.runExclusive(sessionId, async () => {
    if (!todoId || typeof todoId !== 'string' || !todoId.trim()) {
      throw new Error('todoId must be a non-empty string');
    }
    const targetId = todoId.trim();

    const current = await readTodoList(sessionId);
    if (!current) {
      throw new Error(
        `No todo list found for session "${sessionId}". Create one first with TodoWrite.`,
      );
    }

    const itemIndex = current.todos.findIndex((t) => t.id === targetId);
    if (itemIndex === -1) {
      throw new Error(`Todo item with id "${targetId}" not found in current session todo list`);
    }

    if (updates.status === undefined && updates.description === undefined) {
      throw new Error('At least one of status or description must be provided for update');
    }

    const currentItem = current.todos[itemIndex]!;
    const newStatus = updates.status !== undefined ? updates.status : currentItem.status;
    const newDescription =
      updates.description !== undefined ? updates.description.trim() : currentItem.description;

    if (!newDescription) {
      throw new Error('Updated description cannot be empty');
    }

    const updatedTodos: TodoItem[] = current.todos.map((item, idx) => {
      if (idx !== itemIndex) {
        return item;
      }
      return {
        ...item,
        status: newStatus,
        description: newDescription,
      };
    });

    // Revalidate full list (guarantees max 1 in_progress, valid statuses, min/max length, etc.)
    const validated = validateTodoList(updatedTodos);

    const safeSessionId = sanitizeSessionId(sessionId);
    const dir = getSessionTodosDir(safeSessionId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    const payload: PersistedTodoList = {
      schemaVersion: 1,
      sessionId: safeSessionId,
      updatedAt: new Date().toISOString(),
      todos: validated,
    };

    const targetPath = getSessionTodosFilePath(safeSessionId);
    const tempPath = join(dir, `.todos.${randomUUID()}.tmp`);
    const jsonStr = JSON.stringify(payload, null, 2) + '\n';

    try {
      writeFileSync(tempPath, jsonStr, { encoding: 'utf-8', mode: 0o600 });
      const fd = openSync(tempPath, 'r');
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(tempPath, targetPath);
    } catch (err) {
      try {
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
        }
      } catch {}
      throw err;
    }

    return payload;
  });
}
