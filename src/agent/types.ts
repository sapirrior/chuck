import type { ModelMessage } from 'ai';
import type { ProviderName } from '../config/index.js';

export type { ProviderName };

/**
 * Model selection identifier specifying provider and model ID.
 */
export interface ModelSelection {
  provider: ProviderName;
  modelId: string;
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
  temperature?: number;
  maxSteps?: number;
}

/**
 * Summary returned upon completion of an agent turn.
 */
export interface TurnSummary {
  text: string;
  reasoning?: string;
  toolCalls: ToolResultInfo[];
  usage: TokenUsage;
  finishReason: string;
}
