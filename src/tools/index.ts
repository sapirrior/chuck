import { defaultToolCatalog, ToolCatalog } from './catalog.js';
import { readFileTool } from './read-file/index.js';
import { writeFileTool } from './write-file/index.js';
import { editFileTool } from './edit-file/index.js';
import { runCommandTool } from './run-command/index.js';
import { findFilesTool } from './find-files/index.js';
import { searchTextTool } from './search-text/index.js';
import { listDirTool } from './list-dir/index.js';
import { webFetchTool } from './web-fetch/index.js';
import { webSearchTool } from './web-search/index.js';
import type { ToolContext, ToolDefinition } from './types.js';

export const builtInTools: ToolDefinition<any, any>[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  runCommandTool,
  findFilesTool,
  searchTextTool,
  listDirTool,
  webFetchTool,
  webSearchTool,
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
export * from './run-command/index.js';
export * from './find-files/index.js';
export * from './search-text/index.js';
export * from './list-dir/index.js';
export * from './web-fetch/index.js';
export * from './web-search/index.js';
export * from './types.js';
