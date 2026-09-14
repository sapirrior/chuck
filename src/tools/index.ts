import { defaultToolCatalog, ToolCatalog } from './catalog.js';
import { readFileTool } from './read-file/index.js';
import { findFilesTool } from './find-files/index.js';
import { searchTextTool } from './search-text/index.js';
import { listDirTool } from './list-dir/index.js';
import { webFetchTool } from './web-fetch/index.js';
import { webSearchTool } from './web-search/index.js';
import { writeArtifactTool } from './write-artifact/index.js';
import { editArtifactTool } from './edit-artifact/index.js';
import { writePlanTool } from './write-plan/index.js';
import type { ToolContext, ToolDefinition } from './types.js';

export const builtInTools: ToolDefinition<any, any>[] = [
  readFileTool,
  findFilesTool,
  searchTextTool,
  listDirTool,
  webFetchTool,
  webSearchTool,
  writeArtifactTool,
  editArtifactTool,
  writePlanTool,
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
export * from './find-files/index.js';
export * from './search-text/index.js';
export * from './list-dir/index.js';
export * from './web-fetch/index.js';
export * from './web-search/index.js';
export * from './write-artifact/index.js';
export * from './edit-artifact/index.js';
export * from './write-plan/index.js';
export * from './chuck-paths.js';
export * from './types.js';
