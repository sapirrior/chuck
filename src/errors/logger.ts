import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { classifyError } from './classifier.js';

/**
 * Resolves the root directory for error logs: ~/.chuck/logs (or overridden by CHUCK_LOGS_DIR / XD_LOGS_DIR).
 */
export function getLogsRootDir(): string {
  if (process.env.CHUCK_LOGS_DIR) {
    return process.env.CHUCK_LOGS_DIR;
  }
  if (process.env.XD_LOGS_DIR) {
    return process.env.XD_LOGS_DIR;
  }
  return join(homedir(), '.chuck', 'logs');
}

/**
 * Formats a Date object into { date: 'YYYY-MM-DD', time: 'HH-MM-SS' }.
 */
export function getLogDateTime(d = new Date()): { date: string; time: string } {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}-${minutes}-${seconds}`,
  };
}

/**
 * Appends or writes a structured error entry to ~/.chuck/logs/<date>/<time>.log.
 * Returns the path to the written log file.
 */
export function logError(error: unknown, contextInfo?: Record<string, unknown>): string {
  try {
    const rootDir = getLogsRootDir();
    const { date, time } = getLogDateTime();
    const dateDir = join(rootDir, date);

    if (!existsSync(dateDir)) {
      mkdirSync(dateDir, { recursive: true });
    }

    const logPath = join(dateDir, `${time}.log`);
    const structured = classifyError(error);

    const logEntry = {
      timestamp: new Date().toISOString(),
      category: structured.category,
      statusCode: structured.statusCode,
      code: structured.code,
      message: structured.shortMessage,
      isRetryable: structured.isRetryable,
      suggestedAction: structured.suggestedAction,
      context: contextInfo ?? {},
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
              ...(typeof (error as any).responseBody === 'string'
                ? { responseBody: (error as any).responseBody }
                : {}),
              ...(typeof (error as any).statusCode === 'number'
                ? { statusCode: (error as any).statusCode }
                : {}),
            }
          : error,
    };

    const formatted =
      `=== ERROR LOG [${logEntry.timestamp}] ===\n` + JSON.stringify(logEntry, null, 2) + '\n\n';

    if (existsSync(logPath)) {
      appendFileSync(logPath, formatted, 'utf-8');
    } else {
      writeFileSync(logPath, formatted, 'utf-8');
    }

    return logPath;
  } catch {
    // Logging failure should never crash the application
    return '';
  }
}
