import { defaultToolCatalog, ToolCatalog } from './catalog.js';
import { readFileTool } from './list/read-file.js';
import { writeFileTool } from './list/write-file.js';
import { editFileTool } from './list/edit-file.js';
import { runCommandTool } from './list/run-command.js';
import { findFilesTool } from './list/find-files.js';
import { searchTextTool } from './list/search-text.js';
import { listDirTool } from './list/list-dir.js';
import { webFetchTool } from './list/web-fetch.js';
import type { ToolContext } from './types.js';

// Register built-in tools into defaultToolCatalog
defaultToolCatalog.register(readFileTool);
defaultToolCatalog.register(writeFileTool);
defaultToolCatalog.register(editFileTool);
defaultToolCatalog.register(runCommandTool);
defaultToolCatalog.register(findFilesTool);
defaultToolCatalog.register(searchTextTool);
defaultToolCatalog.register(listDirTool);
defaultToolCatalog.register(webFetchTool);

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
export * from './list/read-file.js';
export * from './list/write-file.js';
export * from './list/edit-file.js';
export * from './list/run-command.js';
export * from './list/find-files.js';
export * from './list/search-text.js';
export * from './list/list-dir.js';
export * from './list/web-fetch.js';
export * from './types.js';
