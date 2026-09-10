import { tool as createAISDKTool } from 'ai';
import type { z } from 'zod';
import type { ConfirmationRequest, ToolContext, ToolDefinition } from './types.js';

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
   * Converts all registered tools into AI SDK v7 `tool(...)` instances,
   * with automatic user confirmation interception for mutating actions.
   */
  public toAISDKTools(context: ToolContext): Record<string, any> {
    const aiTools: Record<string, any> = {};

    for (const [name, def] of this.tools.entries()) {
      aiTools[name] = (createAISDKTool as any)({
        description: def.description,
        inputSchema: def.parameters,
        parameters: def.parameters,
        execute: async (args: any) => {
          // 1. Check if this tool requires confirmation
          const policy = def.confirmationPolicy ?? 'never';
          const requiresConfirmation =
            policy !== 'never' && (def.needsConfirmation ? def.needsConfirmation(args) : true);

          if (requiresConfirmation && context.requestConfirmation) {
            // Check session allowlist
            const isWhitelisted = context.sessionAllowlist?.has(name) ?? false;

            if (!isWhitelisted) {
              const request: ConfirmationRequest = def.getConfirmationRequest
                ? def.getConfirmationRequest(args)
                : {
                    toolName: name,
                    displayName: def.displayName,
                    args,
                    promptTitle: `Approve execution of ${def.displayName}?`,
                  };

              const decision = await context.requestConfirmation(request);

              if (decision === 'deny') {
                if (context.onDeny) {
                  context.onDeny();
                }
                const err = new Error(`Interrupted by user`);
                (err as any).isInterrupted = true;
                (err as any).toolName = name;
                throw err;
              }

              if (decision === 'allow_session' && context.sessionAllowlist) {
                context.sessionAllowlist.add(name);
              }
            }
          }

          // 2. Execute tool
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
