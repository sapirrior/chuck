import { defaultToolCatalog, ToolCatalog } from './catalog.js';
import { readFileTool } from './read-file/index.js';
import { writeFileTool } from './write-file/index.js';
import { editFileTool } from './edit-file/index.js';
import { globTool } from './glob/index.js';
import { grepTool } from './grep/index.js';
import { listDirTool } from './list-dir/index.js';
import { sleepTool } from './sleep/index.js';
import { bashTool } from './bash/index.js';
import { taskReadTool } from './task-read/index.js';
import { taskSendInputTool } from './task-send-input/index.js';
import { taskKillTool } from './task-kill/index.js';
import { webFetchTool } from './web-fetch/index.js';
import { webSearchTool } from './web-search/index.js';
import { todoWriteTool } from './todo-write/index.js';
import { todoUpdateTool } from './todo-update/index.js';
import { todoReadTool } from './todo-read/index.js';
import { skillListTool } from './skill-list/index.js';
import { skillReadTool } from './skill-read/index.js';
import type { ToolContext, ToolDefinition } from './types.js';

export const builtInTools: ToolDefinition<any, any>[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  globTool,
  grepTool,
  listDirTool,
  sleepTool,
  bashTool,
  taskReadTool,
  taskSendInputTool,
  taskKillTool,
  webFetchTool,
  webSearchTool,
  todoWriteTool,
  todoUpdateTool,
  todoReadTool,
  skillListTool,
  skillReadTool,
];

// Register all built-in tools into defaultToolCatalog
for (const tool of builtInTools) {
  defaultToolCatalog.register(tool);
}

/**
 * Returns AI SDK v7 formatted tools object for all registered tools in the catalog.
 */
export function getAISDKTools(
  context: ToolContext,
  catalog: ToolCatalog = defaultToolCatalog,
): Record<string, any> {
  return catalog.toAISDKTools(context);
}

export * from './catalog.js';
export * from './read-file/index.js';
export * from './write-file/index.js';
export * from './edit-file/index.js';
export * from './glob/index.js';
export * from './grep/index.js';
export * from './list-dir/index.js';
export * from './sleep/index.js';
export * from './bash/index.js';
export * from './task-read/index.js';
export * from './task-send-input/index.js';
export * from './task-kill/index.js';
export * from './web-fetch/index.js';
export * from './web-search/index.js';
export * from './todo-write/index.js';
export * from './todo-update/index.js';
export * from './todo-read/index.js';
export * from './skill-list/index.js';
export * from './skill-read/index.js';
export * from './types.js';
