export interface ShellExecutionOptions {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  onData?: (chunk: string) => void;
  onLine?: (line: string, allRecentLines: string[]) => void;
  maxBufferLines?: number;
}

export interface ShellExecutionResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
  recentLines: string[];
  totalLines: number;
  durationMs: number;
  interrupted: boolean;
}
