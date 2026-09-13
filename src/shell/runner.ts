import { spawn } from 'node:child_process';
import type { ShellExecutionOptions, ShellExecutionResult } from './types.js';

/**
 * Spawns a shell command with real-time stream processing, line buffering,
 * and rolling window tracking (e.g. 10 newest lines).
 */
export async function executeShellCommand(
  options: ShellExecutionOptions,
): Promise<ShellExecutionResult> {
  const {
    command,
    cwd = process.cwd(),
    timeoutMs = 60000,
    abortSignal,
    onData,
    onLine,
    maxBufferLines = 10,
  } = options;
  const startTime = Date.now();

  return new Promise<ShellExecutionResult>((resolve, reject) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let allOutput = '';
    let allLines: string[] = [];
    let recentLines: string[] = [];
    let isInterrupted = false;

    // Use bash if available, fallback to sh
    const shellBin = process.env.SHELL || '/bin/bash';

    const child = spawn(shellBin, ['-c', command], {
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        PAGER: 'cat',
        FORCE_COLOR: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let timeoutTimer: NodeJS.Timeout | null = null;
    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        isInterrupted = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {}
        }, 2000);
      }, timeoutMs);
    }

    if (abortSignal) {
      if (abortSignal.aborted) {
        isInterrupted = true;
        child.kill('SIGTERM');
      } else {
        abortSignal.addEventListener('abort', () => {
          isInterrupted = true;
          child.kill('SIGTERM');
          setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {}
          }, 1500);
        });
      }
    }

    const processChunk = (chunkStr: string) => {
      onData?.(chunkStr);
      allOutput += chunkStr;

      // Update line buffer
      const split = chunkStr.split('\n');
      for (const line of split) {
        const trimmed = line.replace(/\r/g, '');
        if (trimmed) {
          allLines.push(trimmed);
          recentLines.push(trimmed);
          if (recentLines.length > maxBufferLines) {
            recentLines.shift();
          }
          onLine?.(trimmed, [...recentLines]);
        }
      }
    };

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdoutBuffer += text;
      processChunk(text);
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderrBuffer += text;
      processChunk(text);
    });

    child.on('error', (err) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      reject(err);
    });

    child.on('close', (code) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      const durationMs = Date.now() - startTime;
      const exitCode = code ?? (isInterrupted ? 130 : 0);

      resolve({
        command,
        exitCode,
        stdout: stdoutBuffer.trim(),
        stderr: stderrBuffer.trim(),
        output: allOutput.trim(),
        recentLines,
        totalLines: allLines.length,
        durationMs,
        interrupted: isInterrupted,
      });
    });
  });
}
