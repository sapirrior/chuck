import type { ModelMessage } from 'ai';
import type { ProviderName } from '../config/index.js';

export type { ProviderName };

/**
 * Reasoning / thinking effort level for models.
 */
export type ReasoningEffort =
  'provider-default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Model selection identifier specifying provider, model ID, and optional reasoning effort.
 */
export interface ModelSelection {
  provider: ProviderName;
  modelId: string;
  effort?: ReasoningEffort;
}

/**
 * Token usage metrics for a turn or accumulated across turns.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * Information describing a tool call requested by the model.
 */
export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Information describing a completed tool call execution.
 */
export interface ToolResultInfo extends ToolCallInfo {
  result: unknown;
  isError: boolean;
  durationMs?: number;
  startedAt?: string;
  finishedAt?: string;
}

/**
 * Standard conversation message type compatible with AI SDK v7.
 */
export type AgentMessage = ModelMessage;

/**
 * Active configuration for an agent session.
 */
export interface SessionConfig {
  provider: ProviderName;
  modelId: string;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
  maxSteps?: number;
}

/**
 * Reason explaining why a turn completed.
 */
export type TurnStopReason = 'natural' | 'step-limit' | 'aborted' | 'error';

/**
 * Summary returned upon completion of an agent turn.
 */
export interface TurnSummary {
  text: string;
  reasoning?: string;
  toolCalls: ToolResultInfo[];
  usage: TokenUsage;
  finishReason: string;
  stopReason?: TurnStopReason;
  rawMessages?: ModelMessage[];
  durationMs?: number;
  startedAt?: string;
  finishedAt?: string;
  statusVerb?: string;
}
