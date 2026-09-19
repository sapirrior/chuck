import { z } from 'zod';
import { figures } from '../../theme/index.js';
import {
  writeTodoList,
  type PersistedTodoList,
  type TodoItem,
  type TodoItemStatus,
} from '../../services/todos/index.js';
import type { ToolDefinition } from '../types.js';

const todoItemSchema = z.object({
  id: z.string().min(1, 'id is required').describe('Unique identifier for the todo item'),
  description: z
    .string()
    .min(1, 'description is required')
    .describe('Clear description of the task'),
  status: z
    .enum(['pending', 'in_progress', 'completed', 'cancelled', 'blocked'])
    .describe('Current status of the todo item'),
});

const todoWriteParamsSchema = z.object({
  todos: z
    .array(todoItemSchema)
    .min(2, 'Todo list must contain at least 2 items')
    .max(10, 'Todo list must contain at most 10 items')
    .describe('Complete list of 2 to 10 todo items establishing the execution plan'),
});

export type TodoWriteParams = z.infer<typeof todoWriteParamsSchema>;

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

export const todoWriteTool: ToolDefinition<typeof todoWriteParamsSchema, PersistedTodoList> = {
  name: 'TodoWrite',
  displayName: 'TodoWrite',
  icon: '📝',
  description:
    'Initializes or replaces the current session todo list with 2 to 10 items. Use this to establish or replace the multi-step execution plan for the session.',
  parameters: todoWriteParamsSchema,

  summarizeArgs(args) {
    if (!args.todos || args.todos.length === 0) return '';
    if (args.todos.length <= 2) {
      return args.todos.map((t) => `"${t.description}"`).join(', ');
    }
    return `"${args.todos[0]?.description}", "${args.todos[1]?.description}", +${args.todos.length - 2} more`;
  },

  async execute(args, context) {
    if (!context.sessionId) {
      throw new Error('TodoWrite requires an active session ID in ToolContext');
    }
    return writeTodoList(context.sessionId, args.todos);
  },

  summarize(args, result) {
    const list = result?.todos ?? args.todos;
    const total = list.length;
    const header = `Added ${total} todos`;
    const details = formatTodoListSummary(list);
    return `${header}\n${details}`;
  },
};
