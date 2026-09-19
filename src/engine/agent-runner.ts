import { isStepCount, streamText, type LanguageModel, type ModelMessage } from 'ai';
import { SAFETY_STEP_CEILING } from './constants.js';
import type { AgentEventListener } from './events.js';
import type {
  ReasoningEffort,
  TokenUsage,
  ToolResultInfo,
  TurnStopReason,
  TurnSummary,
} from './types.js';

export interface RunAgentTurnOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  instructions?: string;
  tools?: Record<string, any>;
  maxSteps?: number;
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
  abortSignal?: AbortSignal;
  onEvent?: AgentEventListener;
}

export { SAFETY_STEP_CEILING };

/**
 * Classifies the stop reason based on finish reason, step count, and abort state.
 */
function classifyStopReason(hitStepCeiling: boolean, wasAborted: boolean): TurnStopReason {
  if (wasAborted) return 'aborted';
  if (hitStepCeiling) return 'step-limit';
  return 'natural';
}

/**
 * Runs a single agent turn with multi-step tool support and event streaming.
 */
export async function runAgentTurn(options: RunAgentTurnOptions): Promise<TurnSummary> {
  const maxSteps = options.maxSteps ?? SAFETY_STEP_CEILING;
  const toolResults: ToolResultInfo[] = [];
  const activeTools = new Map<string, { startedAt: string; monotonicStart: number }>();

  const turnStartedAt = new Date().toISOString();
  const turnStartMonotonic = performance.now();

  let accumulatedText = '';
  let stepIndex = 0;

  try {
    const result = streamText({
      model: options.model,
      messages: options.messages,
      instructions: options.instructions,
      tools: options.tools,
      abortSignal: options.abortSignal,
      stopWhen: isStepCount(maxSteps),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      // Pass reasoning effort to the model. 'provider-default' is a valid v7 token
      // meaning "use whatever the provider defaults to". Only omit the field entirely
      // when the caller passes undefined/null (unset — not the same as provider-default).
      ...(options.reasoningEffort != null ? { reasoning: options.reasoningEffort } : {}),
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

        case 'tool-call': {
          activeTools.set(chunk.toolCallId, {
            startedAt: new Date().toISOString(),
            monotonicStart: performance.now(),
          });
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
          const timing = activeTools.get(chunk.toolCallId);
          activeTools.delete(chunk.toolCallId);
          const finishedAt = new Date().toISOString();
          const durationMs = timing
            ? Math.max(0, Math.round(performance.now() - timing.monotonicStart))
            : undefined;

          const toolResult: ToolResultInfo = {
            id: chunk.toolCallId,
            name: chunk.toolName,
            args: (chunk.input as Record<string, unknown>) ?? {},
            result: chunk.output,
            isError: false,
            durationMs,
            startedAt: timing?.startedAt,
            finishedAt,
          };
          toolResults.push(toolResult);
          options.onEvent?.({
            type: 'tool-result',
            toolResult,
          });
          break;
        }

        case 'tool-error': {
          const timing = activeTools.get(chunk.toolCallId);
          activeTools.delete(chunk.toolCallId);
          const finishedAt = new Date().toISOString();
          const durationMs = timing
            ? Math.max(0, Math.round(performance.now() - timing.monotonicStart))
            : undefined;

          const toolResult: ToolResultInfo = {
            id: chunk.toolCallId,
            name: chunk.toolName,
            args: (chunk.input as Record<string, unknown>) ?? {},
            result: chunk.error,
            isError: true,
            durationMs,
            startedAt: timing?.startedAt,
            finishedAt,
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
                // AI SDK v7: nested under outputTokenDetails / inputTokenDetails
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
    const rawTurnMessages = (await result.responseMessages) as ModelMessage[];

    // Ensure finalTurnText captures the complete output (including Gemini buffered steps)
    let finalTurnText = accumulatedText;
    if (!finalTurnText) {
      try {
        const resolvedText = await result.text;
        if (resolvedText) {
          finalTurnText = resolvedText;
        }
      } catch {}
    }

    if (!finalTurnText && rawTurnMessages.length > 0) {
      for (const msg of rawTurnMessages) {
        if (msg.role === 'assistant') {
          if (typeof msg.content === 'string' && msg.content.trim()) {
            finalTurnText = msg.content;
          } else if (Array.isArray(msg.content)) {
            const textParts = msg.content
              .filter((p: any) => p.type === 'text')
              .map((p: any) => p.text)
              .join('');
            if (textParts.trim()) {
              finalTurnText = textParts;
            }
          }
        }
      }
    }

    const hitStepCeiling = stepIndex >= maxSteps;
    const wasAborted = Boolean(options.abortSignal?.aborted);
    const stopReason = classifyStopReason(hitStepCeiling, wasAborted);

    const usage: TokenUsage = {
      inputTokens: rawUsage.inputTokens ?? 0,
      outputTokens: rawUsage.outputTokens ?? 0,
      totalTokens: rawUsage.totalTokens ?? 0,
      // AI SDK v7: nested under outputTokenDetails / inputTokenDetails
      reasoningTokens: rawUsage.outputTokenDetails?.reasoningTokens,
      cacheReadTokens: rawUsage.inputTokenDetails?.cacheReadTokens,
      cacheWriteTokens: rawUsage.inputTokenDetails?.cacheWriteTokens,
    };

    const turnFinishedAt = new Date().toISOString();
    const turnDurationMs = Math.max(0, Math.round(performance.now() - turnStartMonotonic));

    const summary: TurnSummary = {
      text: finalTurnText,
      toolCalls: toolResults,
      usage,
      finishReason,
      stopReason,
      rawMessages: rawTurnMessages,
      durationMs: turnDurationMs,
      startedAt: turnStartedAt,
      finishedAt: turnFinishedAt,
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
