export const SESSION_LOG_SCHEMA_VERSION = 1;

export type SessionLogEventType =
  | 'turn-start'
  | 'tool-start'
  | 'tool-end'
  | 'turn-end';

export interface SessionLogBase {
  schemaVersion: 1;
  sessionId: string;
  turnId: string;
  type: SessionLogEventType;
  timestamp: string;
}

export interface TurnStartLogEvent extends SessionLogBase {
  type: 'turn-start';
  startedAt: string;
  model: {
    provider: string;
    modelId: string;
    effort?: string;
  };
}

export interface ToolStartLogEvent extends SessionLogBase {
  type: 'tool-start';
  toolCallId: string;
  toolName: string;
  startedAt: string;
  stepIndex?: number;
}

export interface ToolEndLogEvent extends SessionLogBase {
  type: 'tool-end';
  toolCallId: string;
  toolName: string;
  finishedAt: string;
  durationMs?: number;
  status: 'completed' | 'failed';
  displayName?: string;
  icon?: string;
  outputSummary?: string;
  errorMessage?: string;
}

export interface TurnEndLogEvent extends SessionLogBase {
  type: 'turn-end';
  finishedAt: string;
  durationMs: number;
  status: 'complete' | 'interrupted' | 'errored';
  statusVerb?: string;
  stopReason?: string;
  finishReason?: string;
  errorMessage?: string;
}

export type SessionLogEvent =
  | TurnStartLogEvent
  | ToolStartLogEvent
  | ToolEndLogEvent
  | TurnEndLogEvent;

export interface LoadedSessionLog {
  events: SessionLogEvent[];
  ignoredLines: number;
}

export interface SessionTurnPresentation {
  start?: TurnStartLogEvent;
  end?: TurnEndLogEvent;
  tools: Map<string, ToolEndLogEvent>;
}

export interface SessionPresentationProjection {
  turns: Map<string, SessionTurnPresentation>;
}
