import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { classifyError } from './classifier.js';

const SENSITIVE_KEY_REGEX = /api[_-]?key|token|secret|password|auth|credential|bearer/i;

/**
 * Resolves the root directory for error logs: ~/.steward/logs (or overridden by STEWARD_LOGS_DIR).
 */
export function getLogsRootDir(): string {
  if (process.env.STEWARD_LOGS_DIR) {
    return process.env.STEWARD_LOGS_DIR;
  }
  return join(homedir(), '.steward', 'logs');
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
 * Deeply serializes an error object, supporting nested causes, AggregateErrors,
 * custom properties, and circular reference protection.
 */
export function serializeError(error: unknown, seen = new WeakSet()): Record<string, unknown> {
  if (error === null || error === undefined) {
    return { value: error };
  }

  if (typeof error !== 'object') {
    return { value: String(error) };
  }

  if (seen.has(error)) {
    return { value: '[Circular Reference]' };
  }
  seen.add(error);

  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    if (error.cause) {
      serialized.cause = serializeError(error.cause, seen);
    }

    if (Array.isArray((error as any).errors)) {
      serialized.errors = (error as any).errors.map((e: unknown) => serializeError(e, seen));
    }

    // Capture response details if present on API errors
    if (typeof (error as any).statusCode === 'number') {
      serialized.statusCode = (error as any).statusCode;
    }
    if (typeof (error as any).responseBody === 'string') {
      serialized.responseBody = (error as any).responseBody;
    }
    if (typeof (error as any).code === 'string') {
      serialized.code = (error as any).code;
    }

    return serialized;
  }

  const obj: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(error as Record<string, unknown>)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      obj[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      obj[key] = serializeError(val, seen);
    } else {
      obj[key] = val;
    }
  }
  return obj;
}

/**
 * Sanitizes arbitrary context objects to redact potential API keys or tokens.
 */
export function sanitizeContext(
  context?: Record<string, unknown>,
  seen = new WeakSet(),
): Record<string, unknown> {
  if (!context || typeof context !== 'object') {
    return {};
  }

  if (seen.has(context)) {
    return { context: '[Circular Reference]' };
  }
  seen.add(context);

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    if (SENSITIVE_KEY_REGEX.test(k)) {
      clean[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitizeContext(v as Record<string, unknown>, seen);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * Appends or writes a structured error entry to ~/.steward/logs/<date>/<time>.log.
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

    const mem = process.memoryUsage ? process.memoryUsage() : undefined;

    const logEntry = {
      timestamp: new Date().toISOString(),
      category: structured.category,
      statusCode: structured.statusCode,
      code: structured.code,
      message: structured.shortMessage,
      isRetryable: structured.isRetryable,
      suggestedAction: structured.suggestedAction,
      runtime: {
        engine: typeof (globalThis as any).Bun !== 'undefined' ? 'bun' : 'node',
        version:
          typeof (globalThis as any).Bun !== 'undefined'
            ? (globalThis as any).Bun.version
            : process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        memoryUsageMB: mem ? Math.round(mem.rss / 1024 / 1024) : undefined,
      },
      context: sanitizeContext(contextInfo),
      error: serializeError(error),
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
