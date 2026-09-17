import { spawn } from 'node:child_process';

export interface ExecShellOptions {
  command: string;
  cwd: string;
  timeoutSeconds?: number;
  abortSignal?: AbortSignal;
}

export interface ExecShellResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Returns the platform-appropriate shell executable and invocation arguments.
 */
export function getPlatformShell(): { shell: string; args: string[] } {
  if (process.platform === 'win32') {
    return {
      shell: process.env.COMSPEC || 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command'],
    };
  }

  const userShell = process.env.SHELL || '/bin/sh';
  return {
    shell: userShell,
    args: ['-c'],
  };
}

/**
 * Safely terminates a child process and its process tree.
 */
export function killProcessTree(child: import('node:child_process').ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;

  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {}
    }
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (err: any) {
      if (err.code !== 'ESRCH') {
        try {
          child.kill('SIGKILL');
        } catch {}
      }
    }
  }
}

/**
 * Executes a shell command asynchronously with streaming output capture,
 * timeout enforcement, cancellation support, and process tree termination.
 */
export async function execShellCommand(options: ExecShellOptions): Promise<ExecShellResult> {
  const { command, cwd, timeoutSeconds = 0, abortSignal } = options;
  const startTime = Date.now();

  const { shell, args } = getPlatformShell();
  const childArgs = [...args, command];

  return new Promise<ExecShellResult>((resolve, reject) => {
    if (abortSignal?.aborted) {
      return reject(new Error('Command aborted before execution.'));
    }

    let timedOut = false;
    let stdoutData = '';
    let stderrData = '';
    let isSettled = false;

    const child = spawn(shell, childArgs, {
      cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });

    let timeoutTimer: NodeJS.Timeout | null = null;
    if (timeoutSeconds > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        killProcessTree(child);
      }, timeoutSeconds * 1000);
    }

    const onAbort = () => {
      if (!isSettled) {
        killProcessTree(child);
        cleanup();
        reject(new Error('Command execution aborted by user.'));
      }
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }

    function cleanup() {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort);
      }
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutData += chunk.toString('utf-8');
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrData += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      reject(new Error(`Failed to spawn shell process: ${err.message}`));
    });

    const settleOnExit = (code: number | null) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();

      const durationMs = Date.now() - startTime;
      resolve({
        command,
        exitCode: timedOut ? 124 : code,
        stdout: stdoutData,
        stderr: stderrData,
        durationMs,
        timedOut,
      });
    };

    child.on('exit', (code) => settleOnExit(code));
    child.on('close', (code) => settleOnExit(code));
  });
}
