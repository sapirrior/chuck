import type { ModelSelection, TokenUsage, ToolResultInfo } from '../engine/types.js';

/**
 * A single conversation turn preserved in durable session storage.
 */
export interface SessionTurn {
  id: string;
  timestamp: string;
  userPrompt: string;
  assistantText: string;
  reasoning?: string;
  toolCalls: ToolResultInfo[];
  usage: TokenUsage;
}

/**
 * Full session document saved at ~/.xd/sessions/<date>/<sessionId>.json
 */
export interface SessionData {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  model: ModelSelection;
  totalUsage: TokenUsage;
  turns: SessionTurn[];
}

/**
 * Lightweight metadata used when listing sessions for /resume.
 */
export interface SessionSummary {
  id: string;
  name: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  model: ModelSelection;
  totalTokens: number;
  turnCount: number;
  filePath: string;
}
