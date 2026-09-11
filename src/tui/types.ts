import type { ConfirmationDecision, ConfirmationRequest } from '../tools/types.js';
import type { ModelDescriptor } from '../models/index.js';
import type { SessionData } from '../session/types.js';

export type ToolExecutionStatus = 'running' | 'completed' | 'failed';

export interface UIHistoryItem {
  id: string;
  type: 'user' | 'assistant' | 'reasoning' | 'tool' | 'system' | 'bash';
  content: string;
  toolData?: {
    toolName: string;
    displayName?: string;
    icon?: string;
    argsSummary?: string;
    status: ToolExecutionStatus;
    durationMs?: number;
    error?: string;
    toolOutput?: string;
  };
}

export interface ActiveConfirmationState {
  request: ConfirmationRequest;
  resolver: (decision: ConfirmationDecision) => void;
}

export interface AppUIState {
  historyItems: UIHistoryItem[];
  streamingReasoning: string;
  streamingText: string;
  isBusy: boolean;
  sessionVersion: number;
  showHelp: boolean;
  showResume: boolean;
  showModelPicker: boolean;
  availableModels: ModelDescriptor[];
  availableSessions: SessionData[];
  activeConfirmation: ActiveConfirmationState | null;
}
