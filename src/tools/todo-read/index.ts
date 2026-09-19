import { z } from 'zod';
import { figures } from '../../theme/index.js';
import {
  readTodoList,
  type PersistedTodoList,
  type TodoItem,
  type TodoItemStatus,
} from '../../services/todos/index.js';
import type { ToolDefinition } from '../types.js';

const todoReadParamsSchema = z.object({});

export type TodoReadParams = z.infer<typeof todoReadParamsSchema>;

export interface TodoReadResult {
  hasTodos: boolean;
  todos: PersistedTodoList['todos'];
  updatedAt?: string;
  message?: string;
}

function formatTodoCheckbox(status: TodoItemStatus): string {
  switch (status) {
    case 'completed':
      return '[x]';
    case 'in_progress':
      return `[${figures.sliderPointer}]`;
    case 'cancelled':
      return `[${figures.cross}]`;
    case 'blocked':
      return `[${figures.warning}]`;
    case 'pending':
    default:
      return '[ ]';
  }
}

function formatTodoListSummary(todos: TodoItem[], maxItems = 10): string {
  const visible = todos.slice(0, maxItems);
  const hiddenCount = todos.length - visible.length;
  const lines = visible.map((t, i) => `${i + 1}. ${formatTodoCheckbox(t.status)} ${t.description}`);
  if (hiddenCount > 0) {
    lines.push(`… and ${hiddenCount} more`);
  }
  return lines.join('\n');
}

export const todoReadTool: ToolDefinition<typeof todoReadParamsSchema, TodoReadResult> = {
  name: 'TodoRead',
  displayName: 'TodoRead',
  icon: '📋',
  description:
    'Reads the current session todo list without modifying it. Returns an empty result if no todos have been established yet.',
  parameters: todoReadParamsSchema,

  summarizeArgs() {
    return '';
  },

  async execute(_args, context) {
    if (!context.sessionId) {
      throw new Error('TodoRead requires an active session ID in ToolContext');
    }
    const list = await readTodoList(context.sessionId);
    if (!list) {
      return {
        hasTodos: false,
        todos: [],
        message: 'No todos currently established for this session.',
      };
    }
    return {
      hasTodos: true,
      todos: list.todos,
      updatedAt: list.updatedAt,
    };
  },

  summarize(_args, result) {
    if (!result || !result.hasTodos || result.todos.length === 0) {
      return 'No active todos';
    }
    const total = result.todos.length;
    const completed = result.todos.filter((t) => t.status === 'completed').length;
    const active = result.todos.find((t) => t.status === 'in_progress');
    const header = active
      ? `Todos ${completed}/${total} done · ▶ ${active.description}`
      : `Todos ${completed}/${total} done`;
    const details = formatTodoListSummary(result.todos);
    return `${header}\n${details}`;
  },
};
