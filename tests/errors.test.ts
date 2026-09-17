import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import {
  logError,
  serializeError,
  sanitizeContext,
  emergencyRestoreTerminal,
  setupGlobalErrorHandlers,
  getLogsRootDir,
} from '../src/errors/index.js';

describe('Production Error Logger & Global Handlers', () => {
  it('logs structured errors to disk with runtime telemetry', () => {
    const error = new Error('Database connection failed');
    const logPath = logError(error, { query: 'SELECT * FROM users', attempt: 3 });

    expect(logPath).toBeTruthy();
    expect(existsSync(logPath)).toBe(true);

    const content = readFileSync(logPath, 'utf-8');
    expect(content).toContain('Database connection failed');
    expect(content).toContain('"query": "SELECT * FROM users"');
    expect(content).toContain('"engine":');
    expect(content).toContain('"platform":');

    // Cleanup
    try {
      rmSync(logPath, { force: true });
    } catch {}
  });

  it('safely serializes nested error causes and AggregateErrors', () => {
    const rootCause = new Error('Root cause network timeout');
    const wrapper = new Error('Service unavailable', { cause: rootCause });

    const serialized = serializeError(wrapper);
    expect(serialized.name).toBe('Error');
    expect(serialized.message).toBe('Service unavailable');
    expect(serialized.cause).toBeDefined();
    expect((serialized.cause as any).message).toBe('Root cause network timeout');
  });

  it('handles circular references without throwing or hanging', () => {
    const circularObj: Record<string, any> = { message: 'Circular test' };
    circularObj.self = circularObj;

    const serialized = serializeError(circularObj);
    expect(serialized.message).toBe('Circular test');
    expect(serialized.self).toEqual({ value: '[Circular Reference]' });
  });

  it('redacts sensitive API keys, tokens, and passwords in context and error objects', () => {
    const rawContext = {
      apiKey: 'sk-secret-12345',
      user_token: 'bearer-xyz',
      password: 'supersecretpassword',
      normalField: 'hello',
    };

    const sanitized = sanitizeContext(rawContext);
    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect(sanitized.user_token).toBe('[REDACTED]');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.normalField).toBe('hello');
  });

  it('emergencyRestoreTerminal executes safely without crashing', () => {
    expect(() => emergencyRestoreTerminal()).not.toThrow();
  });

  it('setupGlobalErrorHandlers initializes process error handlers idempotently', () => {
    expect(() => setupGlobalErrorHandlers()).not.toThrow();
    expect(() => setupGlobalErrorHandlers()).not.toThrow();
  });
});
