import type { ModelMessage } from 'ai';

export interface ExtractedTurnView {
  userPrompt: string;
  assistantText: string;
  reasoning?: string;
  toolInvocations: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
    isError: boolean;
  }>;
}

/**
 * Extracts human-readable and UI-facing views from a list of canonical ModelMessages for a single turn.
 */
export function extractTurnView(messages: ModelMessage[]): ExtractedTurnView {
  let userPrompt = '';
  let assistantText = '';
  let reasoning = '';
  const toolCallsMap = new Map<
    string,
    { id: string; name: string; args: Record<string, unknown>; result?: unknown; isError: boolean }
  >();

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        userPrompt += (userPrompt ? '\n' : '') + msg.content;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            userPrompt += (userPrompt ? '\n' : '') + part.text;
          }
        }
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        assistantText += (assistantText ? '\n' : '') + msg.content;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            assistantText += (assistantText ? '\n' : '') + part.text;
          } else if (part.type === 'reasoning') {
            reasoning += (reasoning ? '\n' : '') + part.text;
          } else if (part.type === 'tool-call') {
            toolCallsMap.set(part.toolCallId, {
              id: part.toolCallId,
              name: part.toolName,
              args: (part.input as Record<string, unknown>) ?? {},
              isError: false,
            });
          }
        }
      }
    } else if (msg.role === 'tool') {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'tool-result') {
            const existing = toolCallsMap.get(part.toolCallId);
            if (existing) {
              existing.result = part.output;
              existing.isError = Boolean(part.isError);
            } else {
              toolCallsMap.set(part.toolCallId, {
                id: part.toolCallId,
                name: part.toolName ?? 'unknown_tool',
                args: {},
                result: part.output,
                isError: Boolean(part.isError),
              });
            }
          }
        }
      }
    }
  }

  return {
    userPrompt,
    assistantText,
    reasoning: reasoning || undefined,
    toolInvocations: Array.from(toolCallsMap.values()),
  };
}
