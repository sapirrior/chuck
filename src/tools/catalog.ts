import { tool as createAISDKTool } from 'ai';
import type { z } from 'zod';
import type { ToolContext, ToolDefinition } from './types.js';

/**
 * Central tool registry and catalog.
 */
export class ToolCatalog {
  private tools = new Map<string, ToolDefinition>();

  /**
   * Registers a tool into the catalog.
   */
  public register<TParams extends z.ZodTypeAny, TResult>(
    definition: ToolDefinition<TParams, TResult>,
  ): this {
    this.tools.set(definition.name, definition as unknown as ToolDefinition);
    return this;
  }

  /**
   * Retrieves a tool by name.
   */
  public get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Returns all registered tools.
   */
  public getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Checks whether a tool exists in the catalog.
   */
  public has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Converts all registered tools into AI SDK v7 `tool(...)` instances.
   */
  public toAISDKTools(context: ToolContext): Record<string, ReturnType<typeof createAISDKTool>> {
    const aiTools: Record<string, ReturnType<typeof createAISDKTool>> = {};

    for (const [name, def] of this.tools.entries()) {
      aiTools[name] = createAISDKTool({
        description: def.description,
        parameters: def.parameters,
        execute: async (args: any) => {
          return def.execute(args, context);
        },
      });
    }

    return aiTools;
  }
}

/**
 * Global default tool catalog instance.
 */
export const defaultToolCatalog = new ToolCatalog();
