import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readTodoList,
  writeTodoList,
  updateTodoItem,
  getSessionTodosFilePath,
  type TodoItem,
} from '../src/services/todos/index.js';
import { todoWriteTool } from '../src/tools/todo-write/index.js';
import { todoUpdateTool } from '../src/tools/todo-update/index.js';
import { todoReadTool } from '../src/tools/todo-read/index.js';

describe('Session-Scoped Todos System', () => {
  let testSettingsDir: string;
  const originalSettingsDir = process.env.STEWARD_SETTINGS_DIR;

  beforeEach(() => {
    testSettingsDir = mkdtempSync(join(tmpdir(), 'steward-todo-test-'));
    process.env.STEWARD_SETTINGS_DIR = testSettingsDir;
  });

  afterEach(() => {
    if (originalSettingsDir !== undefined) {
      process.env.STEWARD_SETTINGS_DIR = originalSettingsDir;
    } else {
      delete process.env.STEWARD_SETTINGS_DIR;
    }
    try {
      rmSync(testSettingsDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Persistence & Session Isolation', () => {
    it('returns empty result when no todos file exists for session', async () => {
      const readResult = await todoReadTool.execute(
        {},
        { cwd: '/workspace', sessionId: 'session-1' },
      );
      expect(readResult.hasTodos).toBe(false);
      expect(readResult.todos).toEqual([]);
      expect(todoReadTool.summarize({}, readResult)).toBe('No active todos');
    });

    it('creates directory and schemaVersion: 1 todos.json on first write', async () => {
      const initialTodos: TodoItem[] = [
        { id: '1', description: 'Explore codebase', status: 'completed' },
        { id: '2', description: 'Implement feature', status: 'in_progress' },
      ];

      const writeResult = await todoWriteTool.execute(
        { todos: initialTodos },
        { cwd: '/workspace', sessionId: 'session-1' },
      );

      expect(writeResult.schemaVersion).toBe(1);
      expect(writeResult.sessionId).toBe('session-1');
      expect(writeResult.todos).toHaveLength(2);

      const readBack = await readTodoList('session-1');
      expect(readBack).not.toBeNull();
      expect(readBack?.todos).toEqual(initialTodos);
    });

    it('isolates state across different session IDs', async () => {
      const sessionATodos: TodoItem[] = [
        { id: 'a1', description: 'Task A1', status: 'pending' },
        { id: 'a2', description: 'Task A2', status: 'in_progress' },
      ];
      const sessionBTodos: TodoItem[] = [
        { id: 'b1', description: 'Task B1', status: 'pending' },
        { id: 'b2', description: 'Task B2', status: 'pending' },
      ];

      await writeTodoList('session-A', sessionATodos);
      await writeTodoList('session-B', sessionBTodos);

      const readA = await readTodoList('session-A');
      const readB = await readTodoList('session-B');

      expect(readA?.todos[0]?.id).toBe('a1');
      expect(readB?.todos[0]?.id).toBe('b1');
    });

    it('persists through session resumption using the same session ID', async () => {
      const todos: TodoItem[] = [
        { id: '1', description: 'Task 1', status: 'completed' },
        { id: '2', description: 'Task 2', status: 'pending' },
      ];

      await writeTodoList('resumed-session-id', todos);

      // Simulating a resumed session looking up state
      const rehydrated = await todoReadTool.execute(
        {},
        { cwd: '/workspace', sessionId: 'resumed-session-id' },
      );
      expect(rehydrated.hasTodos).toBe(true);
      expect(rehydrated.todos).toEqual(todos);
    });
  });

  describe('Validation & Invariants', () => {
    it('rejects list with fewer than 2 items', async () => {
      await expect(
        writeTodoList('session-1', [{ id: '1', description: 'Only one', status: 'pending' }]),
      ).rejects.toThrow(/between 2 and 10 items/);
    });

    it('rejects list with more than 10 items', async () => {
      const elevenItems: TodoItem[] = Array.from({ length: 11 }, (_, i) => ({
        id: `task-${i + 1}`,
        description: `Task description ${i + 1}`,
        status: 'pending',
      }));

      await expect(writeTodoList('session-1', elevenItems)).rejects.toThrow(
        /between 2 and 10 items/,
      );
    });

    it('rejects duplicate IDs', async () => {
      const duplicates: TodoItem[] = [
        { id: 'same-id', description: 'Task 1', status: 'pending' },
        { id: 'same-id', description: 'Task 2', status: 'pending' },
      ];

      await expect(writeTodoList('session-1', duplicates)).rejects.toThrow(/Duplicate todo id/);
    });

    it('rejects empty descriptions', async () => {
      const invalid: TodoItem[] = [
        { id: '1', description: '   ', status: 'pending' },
        { id: '2', description: 'Task 2', status: 'pending' },
      ];

      await expect(writeTodoList('session-1', invalid)).rejects.toThrow(
        /description must be a non-empty string/,
      );
    });

    it('rejects multiple in_progress items on write', async () => {
      const invalid: TodoItem[] = [
        { id: '1', description: 'Task 1', status: 'in_progress' },
        { id: '2', description: 'Task 2', status: 'in_progress' },
      ];

      await expect(writeTodoList('session-1', invalid)).rejects.toThrow(
        /At most 1 todo item can be 'in_progress'/,
      );
    });

    it('rejects invalid status', async () => {
      const invalid = [
        { id: '1', description: 'Task 1', status: 'unknown_status' as any },
        { id: '2', description: 'Task 2', status: 'pending' },
      ];

      await expect(writeTodoList('session-1', invalid)).rejects.toThrow(/status must be one of/);
    });
  });

  describe('Item Updates (TodoUpdate)', () => {
    it('updates exactly one item and keeps others unchanged', async () => {
      const initial: TodoItem[] = [
        { id: '1', description: 'Task 1', status: 'pending' },
        { id: '2', description: 'Task 2', status: 'pending' },
        { id: '3', description: 'Task 3', status: 'pending' },
      ];
      await writeTodoList('session-1', initial);

      const updated = await updateTodoItem('session-1', '2', {
        status: 'in_progress',
        description: 'Task 2 (refined)',
      });

      expect(updated.todos[0]).toEqual(initial[0]);
      expect(updated.todos[1]).toEqual({
        id: '2',
        description: 'Task 2 (refined)',
        status: 'in_progress',
      });
      expect(updated.todos[2]).toEqual(initial[2]);
    });

    it('rejects update for non-existent ID', async () => {
      await writeTodoList('session-1', [
        { id: '1', description: 'Task 1', status: 'pending' },
        { id: '2', description: 'Task 2', status: 'pending' },
      ]);

      await expect(
        updateTodoItem('session-1', 'non-existent', { status: 'completed' }),
      ).rejects.toThrow(/not found/);
    });

    it('rejects update creating a second in_progress item', async () => {
      await writeTodoList('session-1', [
        { id: '1', description: 'Task 1', status: 'in_progress' },
        { id: '2', description: 'Task 2', status: 'pending' },
      ]);

      await expect(updateTodoItem('session-1', '2', { status: 'in_progress' })).rejects.toThrow(
        /At most 1 todo item can be 'in_progress'/,
      );
    });
  });

  describe('Persistence Integrity & Concurrency', () => {
    it('throws when encountering corrupted JSON rather than silently resetting', async () => {
      const initial: TodoItem[] = [
        { id: '1', description: 'Task 1', status: 'pending' },
        { id: '2', description: 'Task 2', status: 'pending' },
      ];
      await writeTodoList('corrupt-test', initial);

      const filePath = getSessionTodosFilePath('corrupt-test');
      writeFileSync(filePath, '{ corrupt json invalid', 'utf-8');

      await expect(readTodoList('corrupt-test')).rejects.toThrow(/Corrupted todo state/);
    });

    it('correctly serializes concurrent updates for the same session', async () => {
      const initial: TodoItem[] = [
        { id: '1', description: 'Task 1', status: 'pending' },
        { id: '2', description: 'Task 2', status: 'pending' },
        { id: '3', description: 'Task 3', status: 'pending' },
      ];
      await writeTodoList('concurrent-session', initial);

      // Fire 3 simultaneous updates
      await Promise.all([
        updateTodoItem('concurrent-session', '1', { status: 'completed' }),
        updateTodoItem('concurrent-session', '2', { status: 'completed' }),
        updateTodoItem('concurrent-session', '3', { status: 'completed' }),
      ]);

      const finalState = await readTodoList('concurrent-session');
      expect(finalState?.todos.every((t) => t.status === 'completed')).toBe(true);
    });
  });

  describe('Tool Summaries', () => {
    it('produces formatted multi-line summaries with checkboxes for terminal output', async () => {
      const initial: TodoItem[] = [
        { id: '1', description: 'Step one', status: 'completed' },
        { id: '2', description: 'Step two', status: 'in_progress' },
        { id: '3', description: 'Step three', status: 'pending' },
      ];

      const writeRes = await todoWriteTool.execute(
        { todos: initial },
        { cwd: '/workspace', sessionId: 'summary-session' },
      );
      const writeSummary = todoWriteTool.summarize({ todos: initial }, writeRes);
      expect(writeSummary).toContain('Added 3 todos');
      expect(writeSummary).toContain('1. [x] Step one');
      expect(writeSummary).toContain('2. [▲] Step two');
      expect(writeSummary).toContain('3. [ ] Step three');

      const updateRes = await todoUpdateTool.execute(
        { id: '2', status: 'completed' },
        { cwd: '/workspace', sessionId: 'summary-session' },
      );
      const updateSummary = todoUpdateTool.summarize({ id: '2', status: 'completed' }, updateRes);
      expect(updateSummary).toContain('Todo 2 completed · 2/3 done');
      expect(updateSummary).toContain('2. [x] Step two');

      const readRes = await todoReadTool.execute(
        {},
        { cwd: '/workspace', sessionId: 'summary-session' },
      );
      const readSummary = todoReadTool.summarize({}, readRes);
      expect(readSummary).toContain('Todos 2/3 done');
      expect(readSummary).toContain('1. [x] Step one');
    });
  });
});
