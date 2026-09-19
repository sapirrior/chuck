export type UpdateState = 'idle' | 'checking' | 'available' | 'no-updates' | 'error';

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
}

export interface UpdateCheckerOptions {
  currentVersion?: string;
  repo?: string;
  onStatusChange?: (state: UpdateState, info?: { version?: string; message?: string }) => void;
  timeoutMs?: number;
  minDisplayMs?: number;
}
