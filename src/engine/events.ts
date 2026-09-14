import type { TokenUsage, ToolCallInfo, ToolResultInfo, TurnSummary } from './types.js';

/**
 * Strongly-typed domain events emitted by the agent runner.
 * The TUI presentation layer (or any headless caller) subscribes to these.
 */
export type AgentEvent =
  | {
      type: 'text-delta';
      text: string;
    }
  | {
      type: 'reasoning-delta';
      reasoning: string;
    }
  | {
      type: 'tool-call';
      toolCall: ToolCallInfo;
    }
  | {
      type: 'tool-result';
      toolResult: ToolResultInfo;
    }
  | {
      type: 'step-end';
      stepIndex: number;
      usage?: TokenUsage;
    }
  | {
      type: 'turn-complete';
      summary: TurnSummary;
    }
  | {
      type: 'error';
      error: Error;
      isFatal: boolean;
    };

/**
 * Event listener callback for agent events.
 */
export type AgentEventListener = (event: AgentEvent) => void;
