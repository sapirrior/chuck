export type UpdateState =
  'idle' | 'checking' | 'no-updates' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  tag: string;
  releaseUrl?: string;
}

export interface AutoUpdaterOptions {
  currentVersion?: string;
  repo?: string;
  onStatusChange?: (state: UpdateState, info?: { version?: string; message?: string }) => void;
  checkOnStart?: boolean;
  timeoutMs?: number;
  checkIntervalMs?: number;
}
