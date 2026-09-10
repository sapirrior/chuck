import { isStepCount, streamText, type LanguageModel, type ModelMessage } from 'ai';
import type { AgentEventListener } from './events.js';
import type { TokenUsage, ToolResultInfo, TurnSummary } from './types.js';

export interface RunAgentTurnOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  instructions?: string;
  tools?: Record<string, any>;
  maxSteps?: number;
  abortSignal?: AbortSignal;
  onEvent?: AgentEventListener;
}

const DEFAULT_MAX_STEPS = 10;

/**
 * Runs a single agent turn with multi-step tool support and event streaming.
 */
export async function runAgentTurn(options: RunAgentTurnOptions): Promise<TurnSummary> {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const toolResults: ToolResultInfo[] = [];

  let accumulatedText = '';
  let accumulatedReasoning = '';
  let stepIndex = 0;

  try {
    const result = streamText({
      model: options.model,
      messages: options.messages,
      instructions: options.instructions,
      tools: options.tools,
      abortSignal: options.abortSignal,
      stopWhen: isStepCount(maxSteps),
    });

    for await (const chunk of result.stream) {
      if (options.abortSignal?.aborted) {
        break;
      }

      switch (chunk.type) {
        case 'text-delta': {
          accumulatedText += chunk.text;
          options.onEvent?.({
            type: 'text-delta',
            text: chunk.text,
          });
          break;
        }

        case 'reasoning-delta': {
          accumulatedReasoning += chunk.text;
          options.onEvent?.({
            type: 'reasoning-delta',
            reasoning: chunk.text,
          });
          break;
        }

        case 'tool-call': {
          const toolCall = {
            id: chunk.toolCallId,
            name: chunk.toolName,
            args: (chunk.input as Record<string, unknown>) ?? {},
          };
          options.onEvent?.({
            type: 'tool-call',
            toolCall,
          });
          break;
        }

        case 'tool-result': {
          const toolResult: ToolResultInfo = {
            id: chunk.toolCallId,
            name: chunk.toolName,
            args: (chunk.input as Record<string, unknown>) ?? {},
            result: chunk.output,
            isError: false,
          };
          toolResults.push(toolResult);
          options.onEvent?.({
            type: 'tool-result',
            toolResult,
          });
          break;
        }

        case 'tool-error': {
          const toolResult: ToolResultInfo = {
            id: chunk.toolCallId,
            name: chunk.toolName,
            args: (chunk.input as Record<string, unknown>) ?? {},
            result: chunk.error,
            isError: true,
          };
          toolResults.push(toolResult);
          options.onEvent?.({
            type: 'tool-result',
            toolResult,
          });
          break;
        }

        case 'finish-step': {
          stepIndex++;
          const stepUsage: TokenUsage | undefined = chunk.usage
            ? {
                inputTokens: chunk.usage.inputTokens ?? 0,
                outputTokens: chunk.usage.outputTokens ?? 0,
                totalTokens: chunk.usage.totalTokens ?? 0,
                reasoningTokens: chunk.usage.outputTokenDetails?.reasoningTokens,
                cacheReadTokens: chunk.usage.inputTokenDetails?.cacheReadTokens,
                cacheWriteTokens: chunk.usage.inputTokenDetails?.cacheWriteTokens,
              }
            : undefined;

          options.onEvent?.({
            type: 'step-end',
            stepIndex,
            usage: stepUsage,
          });
          break;
        }

        case 'error': {
          const error = chunk.error instanceof Error ? chunk.error : new Error(String(chunk.error));
          options.onEvent?.({
            type: 'error',
            error,
            isFatal: false,
          });
          break;
        }
      }
    }

    const rawUsage = await result.usage;
    const finishReason = await result.finishReason;

    const usage: TokenUsage = {
      inputTokens: rawUsage.inputTokens ?? 0,
      outputTokens: rawUsage.outputTokens ?? 0,
      totalTokens: rawUsage.totalTokens ?? 0,
      reasoningTokens: rawUsage.outputTokenDetails?.reasoningTokens,
      cacheReadTokens: rawUsage.inputTokenDetails?.cacheReadTokens,
      cacheWriteTokens: rawUsage.inputTokenDetails?.cacheWriteTokens,
    };

    const summary: TurnSummary = {
      text: accumulatedText,
      reasoning: accumulatedReasoning || undefined,
      toolCalls: toolResults,
      usage,
      finishReason,
    };

    options.onEvent?.({
      type: 'turn-complete',
      summary,
    });

    return summary;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    options.onEvent?.({
      type: 'error',
      error,
      isFatal: true,
    });
    throw error;
  }
}
