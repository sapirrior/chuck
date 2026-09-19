import { z } from 'zod';
import { figures } from '../../theme/index.js';
import {
  updateTodoItem,
  type PersistedTodoList,
  type TodoItem,
  type TodoItemStatus,
} from '../../services/todos/index.js';
import type { ToolDefinition } from '../types.js';

const todoUpdateParamsSchema = z.object({
  id: z.string().min(1, 'id is required').describe('ID of the existing todo item to update'),
  status: z
    .enum(['pending', 'in_progress', 'completed', 'cancelled', 'blocked'])
    .optional()
    .describe('New status for the todo item'),
  description: z.string().min(1).optional().describe('Updated description for the todo item'),
});

export type TodoUpdateParams = z.infer<typeof todoUpdateParamsSchema>;

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

export const todoUpdateTool: ToolDefinition<typeof todoUpdateParamsSchema, PersistedTodoList> = {
  name: 'TodoUpdate',
  displayName: 'TodoUpdate',
  icon: '✓',
  description:
    'Updates a single todo item status or description in the current session. Cannot create new items or update multiple items at once.',
  parameters: todoUpdateParamsSchema,

  summarizeArgs(args) {
    const parts: string[] = [`id: "${args.id}"`];
    if (args.status) parts.push(`status: "${args.status}"`);
    if (args.description) parts.push(`desc: "${args.description}"`);
    return parts.join(', ');
  },

  async execute(args, context) {
    if (!context.sessionId) {
      throw new Error('TodoUpdate requires an active session ID in ToolContext');
    }
    return updateTodoItem(context.sessionId, args.id, {
      status: args.status,
      description: args.description,
    });
  },

  summarize(args, result) {
    if (!result || !result.todos) {
      return `Todo ${args.id} updated`;
    }
    const total = result.todos.length;
    const completed = result.todos.filter((t) => t.status === 'completed').length;
    const updatedItem = result.todos.find((t) => t.id === args.id);
    const statusText = updatedItem?.status ?? args.status ?? 'updated';
    const header = `Todo ${args.id} ${statusText} · ${completed}/${total} done`;
    const details = formatTodoListSummary(result.todos);
    return `${header}\n${details}`;
  },
};
