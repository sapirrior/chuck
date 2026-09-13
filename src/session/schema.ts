import { z } from 'zod';
import type { ModelMessage } from 'ai';
import type { ModelSelection, TokenUsage } from '../engine/types.js';

export const SESSION_SCHEMA_VERSION = 2;

export interface ToolCallSummary {
  id: string;
  name: string;
  status: 'completed' | 'failed' | 'denied' | 'aborted';
  argsSummary: string;
  durationMs?: number;
  isError: boolean;
  /** Bounded preview only, not the full result. */
  resultPreview?: string;
  resultTruncated: boolean;
}

export interface SessionTurnV2 {
  id: string;
  timestamp: string;
  status: 'complete' | 'interrupted' | 'errored';
  userPrompt: string;
  assistantText: string;
  reasoning?: string;
  usage: TokenUsage;
  /** Single source of truth for model replay — normalized ModelMessage[] for this turn only. */
  messages: ModelMessage[];
  /** Bounded, UI-facing summaries only — never full tool result payloads. */
  toolCallSummaries: ToolCallSummary[];
}

export interface SessionDocumentV2 {
  schemaVersion: 2;
  id: string;
  name: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  model: ModelSelection;
  totalUsage: TokenUsage;
  turns: SessionTurnV2[];
}

export const TokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  reasoningTokens: z.number().optional(),
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
});

export const ModelSelectionSchema = z.object({
  provider: z.string() as z.ZodType<any>,
  modelId: z.string(),
});

export const ToolCallSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['completed', 'failed', 'denied', 'aborted']),
  argsSummary: z.string(),
  durationMs: z.number().optional(),
  isError: z.boolean(),
  resultPreview: z.string().optional(),
  resultTruncated: z.boolean(),
});

export const SessionTurnV2Schema = z.object({
  id: z.string(),
  timestamp: z.string(),
  status: z.enum(['complete', 'interrupted', 'errored']),
  userPrompt: z.string(),
  assistantText: z.string(),
  reasoning: z.string().optional(),
  usage: TokenUsageSchema,
  messages: z.array(z.any()),
  toolCallSummaries: z.array(ToolCallSummarySchema),
});

export const SessionDocumentV2Schema = z.object({
  schemaVersion: z.literal(2),
  id: z.string(),
  name: z.string(),
  date: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  model: ModelSelectionSchema,
  totalUsage: TokenUsageSchema,
  turns: z.array(SessionTurnV2Schema),
});
