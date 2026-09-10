import type { ConfirmationDecision, ConfirmationRequest } from '../tools/types.js';
import type { ModelDescriptor } from '../models/index.js';
import type { SessionData } from '../session/types.js';
import type { UIHistoryItem } from '../components/message-history.js';

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

export const initialUIState: AppUIState = {
  historyItems: [],
  streamingReasoning: '',
  streamingText: '',
  isBusy: false,
  sessionVersion: 0,
  showHelp: false,
  showResume: false,
  showModelPicker: false,
  availableModels: [],
  availableSessions: [],
  activeConfirmation: null,
};
