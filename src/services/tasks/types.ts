export type ShellTaskStatus = 'running' | 'completed' | 'failed' | 'killed';

export interface ShellTask {
  id: string;
  status: ShellTaskStatus;
  command: string;
  cwd: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  outputPath?: string;
  output: string;
  outputTruncated: boolean;
  stdinOpen: boolean;
  pid?: number;
}

export interface ShellTaskReadResult {
  id: string;
  status: ShellTaskStatus;
  command: string;
  cwd: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  output: string;
  outputTruncated: boolean;
  stdinOpen: boolean;
}

export interface ShellTaskSendInputResult {
  id: string;
  status: ShellTaskStatus;
  bytesWritten: number;
  output: string;
  outputTruncated: boolean;
  message: string;
}

export interface ShellTaskKillResult {
  id: string;
  status: ShellTaskStatus;
  command: string;
  message: string;
}
