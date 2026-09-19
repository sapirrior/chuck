export type TodoItemStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'blocked';

export interface TodoItem {
  id: string;
  description: string;
  status: TodoItemStatus;
}

export interface PersistedTodoList {
  schemaVersion: 1;
  sessionId: string;
  updatedAt: string;
  todos: TodoItem[];
}

export interface TodoStateSummary {
  total: number;
  completed: number;
  inProgress?: TodoItem;
  pending: number;
  cancelled: number;
  blocked: number;
}
