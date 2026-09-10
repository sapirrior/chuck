import { defaultToolCatalog, ToolCatalog } from './catalog.js';
import { readFileTool } from './list/read-file.js';
import { webFetchTool } from './list/web-fetch.js';
import type { ToolContext } from './types.js';

// Register built-in tools into defaultToolCatalog
defaultToolCatalog.register(readFileTool);
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
export * from './list/web-fetch.js';
export * from './types.js';
