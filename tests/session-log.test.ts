import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SessionLogWriter,
  loadSessionLog,
  buildSessionPresentationProjection,
  removeSessionLog,
  getSessionLogsRootDir,
  getSessionLogPath,
} from '../src/session/logs/store.js';
import type { SessionLogEvent } from '../src/session/logs/types.js';
import { rehydrateSessionHistory, mergeSessionPresentation } from '../src/session/helpers.js';
import type { SessionData } from '../src/session/types.js';

describe('Session Presentation Journal & Logging', () => {
  const testDate = '2026-09-19';
  const testSessionId = 'test-session-123';
  const testDir = join(getSessionLogsRootDir(), testDate);

  beforeEach(() => {
    removeSessionLog(testDate, testSessionId);
  });

  afterEach(() => {
    removeSessionLog(testDate, testSessionId);
    if (existsSync(testDir)) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('A. round-trip: writes and loads events accurately', async () => {
    const writer = new SessionLogWriter(testDate, testSessionId);

    const turnStart: SessionLogEvent = {
      schemaVersion: 1,
      sessionId: testSessionId,
      turnId: 'turn-1',
      type: 'turn-start',
      timestamp: '2026-09-19T10:00:00.000Z',
      startedAt: '2026-09-19T10:00:00.000Z',
      model: {
        provider: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        effort: 'high',
      },
    };

    const toolStart: SessionLogEvent = {
      schemaVersion: 1,
      sessionId: testSessionId,
      turnId: 'turn-1',
      type: 'tool-start',
      timestamp: '2026-09-19T10:00:01.000Z',
      toolCallId: 'call-1',
      toolName: 'read_file',
      startedAt: '2026-09-19T10:00:01.000Z',
    };

    const toolEnd: SessionLogEvent = {
      schemaVersion: 1,
      sessionId: testSessionId,
      turnId: 'turn-1',
      type: 'tool-end',
      timestamp: '2026-09-19T10:00:01.250Z',
      toolCallId: 'call-1',
      toolName: 'read_file',
      finishedAt: '2026-09-19T10:00:01.250Z',
      durationMs: 250,
      status: 'completed',
      displayName: 'Read file',
      outputSummary: 'Read 50 of 50 lines',
    };

    const turnEnd: SessionLogEvent = {
      schemaVersion: 1,
      sessionId: testSessionId,
      turnId: 'turn-1',
      type: 'turn-end',
      timestamp: '2026-09-19T10:00:05.000Z',
      finishedAt: '2026-09-19T10:00:05.000Z',
      durationMs: 5000,
      status: 'complete',
      statusVerb: 'Baked',
      stopReason: 'natural',
      finishReason: 'stop',
    };

    await writer.append(turnStart);
    await writer.append(toolStart);
    await writer.append(toolEnd);
    await writer.append(turnEnd);
    await writer.close();

    const loaded = loadSessionLog(testDate, testSessionId);
    expect(loaded).not.toBeNull();
    expect(loaded?.ignoredLines).toBe(0);
    expect(loaded?.events.length).toBe(4);
    expect(loaded?.events[0]).toEqual(turnStart);
    expect(loaded?.events[1]).toEqual(toolStart);
    expect(loaded?.events[2]).toEqual(toolEnd);
    expect(loaded?.events[3]).toEqual(turnEnd);
  });

  it('B. missing file: loadSessionLog returns null without error', () => {
    const loaded = loadSessionLog('2099-01-01', 'nonexistent-session');
    expect(loaded).toBeNull();
  });

  it('C. malformed final line: recovers prior valid events and tracks ignoredLines', () => {
    const filePath = getSessionLogPath(testDate, testSessionId);
    mkdirSync(join(getSessionLogsRootDir(), testDate), { recursive: true });

    const validEvent1: SessionLogEvent = {
      schemaVersion: 1,
      sessionId: testSessionId,
      turnId: 'turn-1',
      type: 'turn-start',
      timestamp: '2026-09-19T10:00:00.000Z',
      startedAt: '2026-09-19T10:00:00.000Z',
      model: { provider: 'google', modelId: 'gemini-2.5-pro' },
    };

    const validEvent2: SessionLogEvent = {
      schemaVersion: 1,
      sessionId: testSessionId,
      turnId: 'turn-1',
      type: 'tool-end',
      timestamp: '2026-09-19T10:00:02.000Z',
      toolCallId: 'call-2',
      toolName: 'list_dir',
      finishedAt: '2026-09-19T10:00:02.000Z',
      durationMs: 120,
      status: 'completed',
    };

    const lines = [
      JSON.stringify(validEvent1),
      JSON.stringify(validEvent2),
      '{"schemaVersion":1,"sessionId":"test-session-123","type":"tool-end","turnId":"turn-1", truncated json...',
    ].join('\n');

    writeFileSync(filePath, lines, 'utf-8');

    const loaded = loadSessionLog(testDate, testSessionId);
    expect(loaded).not.toBeNull();
    expect(loaded?.events.length).toBe(2);
    expect(loaded?.ignoredLines).toBe(1);
    expect(loaded?.events[0]).toEqual(validEvent1);
    expect(loaded?.events[1]).toEqual(validEvent2);
  });

  it('D. unknown event type and wrong sessionId are safely ignored', () => {
    const filePath = getSessionLogPath(testDate, testSessionId);
    mkdirSync(join(getSessionLogsRootDir(), testDate), { recursive: true });

    const validEvent: SessionLogEvent = {
      schemaVersion: 1,
      sessionId: testSessionId,
      turnId: 'turn-1',
      type: 'turn-start',
      timestamp: '2026-09-19T10:00:00.000Z',
      startedAt: '2026-09-19T10:00:00.000Z',
      model: { provider: 'google', modelId: 'gemini-2.5-pro' },
    };

    const wrongSessionEvent = {
      schemaVersion: 1,
      sessionId: 'other-session-999',
      turnId: 'turn-1',
      type: 'turn-start',
      timestamp: '2026-09-19T10:00:00.000Z',
      startedAt: '2026-09-19T10:00:00.000Z',
      model: { provider: 'google', modelId: 'gemini-2.5-pro' },
    };

    const unknownTypeEvent = {
      schemaVersion: 1,
      sessionId: testSessionId,
      turnId: 'turn-1',
      type: 'unknown-telemetry-event',
      timestamp: '2026-09-19T10:00:00.000Z',
    };

    const lines = [
      JSON.stringify(wrongSessionEvent),
      JSON.stringify(validEvent),
      JSON.stringify(unknownTypeEvent),
    ].join('\n');

    writeFileSync(filePath, lines, 'utf-8');

    const loaded = loadSessionLog(testDate, testSessionId);
    expect(loaded).not.toBeNull();
    expect(loaded?.events.length).toBe(1);
    expect(loaded?.events[0]).toEqual(validEvent);
    expect(loaded?.ignoredLines).toBe(2);
  });

  it('E. projection builder: handles duplicate tool-end deterministically and builds map', () => {
    const events: SessionLogEvent[] = [
      {
        schemaVersion: 1,
        sessionId: testSessionId,
        turnId: 'turn-1',
        type: 'turn-start',
        timestamp: '2026-09-19T10:00:00.000Z',
        startedAt: '2026-09-19T10:00:00.000Z',
        model: { provider: 'anthropic', modelId: 'claude-3-7-sonnet' },
      },
      {
        schemaVersion: 1,
        sessionId: testSessionId,
        turnId: 'turn-1',
        type: 'tool-end',
        timestamp: '2026-09-19T10:00:01.000Z',
        toolCallId: 'call-1',
        toolName: 'read_file',
        finishedAt: '2026-09-19T10:00:01.000Z',
        durationMs: 100,
        status: 'completed',
        outputSummary: 'Old summary',
      },
      {
        schemaVersion: 1,
        sessionId: testSessionId,
        turnId: 'turn-1',
        type: 'tool-end',
        timestamp: '2026-09-19T10:00:02.000Z',
        toolCallId: 'call-1',
        toolName: 'read_file',
        finishedAt: '2026-09-19T10:00:02.000Z',
        durationMs: 200,
        status: 'completed',
        outputSummary: 'Updated summary',
      },
      {
        schemaVersion: 1,
        sessionId: testSessionId,
        turnId: 'turn-1',
        type: 'turn-end',
        timestamp: '2026-09-19T10:00:05.000Z',
        finishedAt: '2026-09-19T10:00:05.000Z',
        durationMs: 5000,
        status: 'complete',
        statusVerb: 'Brewed',
      },
    ];

    const proj = buildSessionPresentationProjection(events);
    expect(proj.turns.size).toBe(1);
    const turn = proj.turns.get('turn-1');
    expect(turn).toBeDefined();
    expect(turn?.start?.model.modelId).toBe('claude-3-7-sonnet');
    expect(turn?.end?.statusVerb).toBe('Brewed');
    expect(turn?.end?.durationMs).toBe(5000);
    expect(turn?.tools.size).toBe(1);
    expect(turn?.tools.get('call-1')?.durationMs).toBe(200);
    expect(turn?.tools.get('call-1')?.outputSummary).toBe('Updated summary');
  });

  it('F. rehydrateSessionHistory augmentation with presentation projection', () => {
    const mockSession: SessionData = {
      schemaVersion: 1,
      id: testSessionId,
      name: 'Test Session',
      date: testDate,
      createdAt: '2026-09-19T10:00:00.000Z',
      updatedAt: '2026-09-19T10:00:05.000Z',
      model: { provider: 'anthropic', modelId: 'claude-3-7-sonnet' },
      totalUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      turns: [
        {
          id: 'turn-1',
          timestamp: '2026-09-19T10:00:00.000Z',
          status: 'complete',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          messages: [
            { role: 'user', content: 'Read package.json' },
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'read_file',
                  input: { path: 'package.json' },
                },
              ] as any,
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call-1',
                  toolName: 'read_file',
                  output: { content: '{"name": "steward"}' },
                },
              ] as any,
            },
            {
              role: 'assistant',
              content: 'I read package.json successfully.',
            },
          ],
        },
      ],
    };

    // 1. Without presentation log (legacy session fallback)
    const legacyItems = rehydrateSessionHistory(mockSession);
    expect(legacyItems.length).toBe(3);
    expect(legacyItems[0]?.type).toBe('user');
    expect(legacyItems[0]?.content).toBe('Read package.json');
    expect(legacyItems[1]?.type).toBe('tool');
    expect(legacyItems[1]?.toolData?.toolName).toBe('read_file');
    expect(legacyItems[1]?.toolData?.durationMs).toBeUndefined();
    expect(legacyItems[2]?.type).toBe('assistant');

    // 2. With presentation log projection
    const projection = buildSessionPresentationProjection([
      {
        schemaVersion: 1,
        sessionId: testSessionId,
        turnId: 'turn-1',
        type: 'turn-start',
        timestamp: '2026-09-19T10:00:00.000Z',
        startedAt: '2026-09-19T10:00:00.000Z',
        model: { provider: 'anthropic', modelId: 'claude-3-7-sonnet' },
      },
      {
        schemaVersion: 1,
        sessionId: testSessionId,
        turnId: 'turn-1',
        type: 'tool-end',
        timestamp: '2026-09-19T10:00:01.000Z',
        toolCallId: 'call-1',
        toolName: 'read_file',
        finishedAt: '2026-09-19T10:00:01.000Z',
        durationMs: 145,
        status: 'completed',
        displayName: 'Read file',
        outputSummary: 'Read 25 of 25 lines',
      },
      {
        schemaVersion: 1,
        sessionId: testSessionId,
        turnId: 'turn-1',
        type: 'turn-end',
        timestamp: '2026-09-19T10:00:05.000Z',
        finishedAt: '2026-09-19T10:00:05.000Z',
        durationMs: 2300,
        status: 'complete',
        statusVerb: 'Baked',
      },
    ]);

    const enrichedItems = mergeSessionPresentation(mockSession, legacyItems, projection);
    expect(enrichedItems.length).toBe(3);
    expect(enrichedItems[1]?.type).toBe('tool');
    expect(enrichedItems[1]?.toolData?.durationMs).toBe(145);
    expect(enrichedItems[1]?.toolData?.displayName).toBe('Read file');
    expect(enrichedItems[1]?.toolData?.toolOutput).toBe('Read 25 of 25 lines');
    expect(enrichedItems[2]?.type).toBe('assistant');
  });

  it('G. concurrent append calls serialize in-order without race', async () => {
    const writer = new SessionLogWriter(testDate, testSessionId);
    const count = 20;
    const promises: Promise<void>[] = [];

    for (let i = 0; i < count; i++) {
      promises.push(
        writer.append({
          schemaVersion: 1,
          sessionId: testSessionId,
          turnId: `turn-${i}`,
          type: 'turn-start',
          timestamp: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          model: { provider: 'openai', modelId: 'gpt-4o' },
        }),
      );
    }

    await Promise.all(promises);
    await writer.close();

    const loaded = loadSessionLog(testDate, testSessionId);
    expect(loaded?.events.length).toBe(count);
    for (let i = 0; i < count; i++) {
      expect(loaded?.events[i]?.turnId).toBe(`turn-${i}`);
    }
  });

  it('H. multiple tool calls in a single message turn: all matched and augmented by toolCallId', () => {
    const multiToolSession: SessionData = {
      schemaVersion: 1,
      id: testSessionId,
      name: 'Multi-Tool Session',
      date: testDate,
      createdAt: '2026-09-19T10:00:00.000Z',
      updatedAt: '2026-09-19T10:00:10.000Z',
      model: { provider: 'anthropic', modelId: 'claude-3-7-sonnet' },
      totalUsage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      turns: [
        {
          id: 'turn-multi',
          timestamp: '2026-09-19T10:00:00.000Z',
          status: 'complete',
          usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
          messages: [
            { role: 'user', content: 'Search and edit files' },
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-read',
                  toolName: 'read_file',
                  input: { path: 'src/app.ts' },
                },
                {
                  type: 'tool-call',
                  toolCallId: 'call-grep',
                  toolName: 'grep',
                  input: { query: 'foo' },
                },
                {
                  type: 'tool-call',
                  toolCallId: 'call-write',
                  toolName: 'write_file',
                  input: { path: 'src/out.ts' },
                },
              ] as any,
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call-read',
                  toolName: 'read_file',
                  output: { lines: 100 },
                },
                {
                  type: 'tool-result',
                  toolCallId: 'call-grep',
                  toolName: 'grep',
                  isError: true,
                  output: { message: 'Pattern not found' },
                },
                {
                  type: 'tool-result',
                  toolCallId: 'call-write',
                  toolName: 'write_file',
                  output: { linesWritten: 10, path: 'src/out.ts' },
                },
              ] as any,
            },
            {
              role: 'assistant',
              content: 'Completed all operations.',
            },
          ],
        },
      ],
    };

    const projection = buildSessionPresentationProjection([
      {
        schemaVersion: 1,
        sessionId: testSessionId,
        turnId: 'turn-multi',
        type: 'turn-start',
        timestamp: '2026-09-19T10:00:00.000Z',
        startedAt: '2026-09-19T10:00:00.000Z',
        model: { provider: 'anthropic', modelId: 'claude-3-7-sonnet' },
      },
      {
        schemaVersion: 1,
        sessionId: testSessionId,
        turnId: 'turn-multi',
        type: 'tool-end',
        timestamp: '2026-09-19T10:00:01.000Z',
        toolCallId: 'call-read',
        toolName: 'read_file',
        finishedAt: '2026-09-19T10:00:01.000Z',
        durationMs: 80,
        status: 'completed',
        displayName: 'Read file',
        outputSummary: 'Read 100 lines',
      },
      {
        schemaVersion: 1,
        sessionId: testSessionId,
        turnId: 'turn-multi',
        type: 'tool-end',
        timestamp: '2026-09-19T10:00:02.000Z',
        toolCallId: 'call-grep',
        toolName: 'grep',
        finishedAt: '2026-09-19T10:00:02.000Z',
        durationMs: 150,
        status: 'failed',
        displayName: 'Grep pattern',
        errorMessage: 'Pattern not found',
      },
      {
        schemaVersion: 1,
        sessionId: testSessionId,
        turnId: 'turn-multi',
        type: 'tool-end',
        timestamp: '2026-09-19T10:00:03.000Z',
        toolCallId: 'call-write',
        toolName: 'write_file',
        finishedAt: '2026-09-19T10:00:03.000Z',
        durationMs: 45,
        status: 'completed',
        displayName: 'Write file',
        outputSummary: 'Wrote 10 lines to src/out.ts',
      },
      {
        schemaVersion: 1,
        sessionId: testSessionId,
        turnId: 'turn-multi',
        type: 'turn-end',
        timestamp: '2026-09-19T10:00:05.000Z',
        finishedAt: '2026-09-19T10:00:05.000Z',
        durationMs: 4500,
        status: 'complete',
        statusVerb: 'Crafted',
      },
    ]);

    const items = rehydrateSessionHistory(multiToolSession, projection);
    // user + 3 tools + assistant = 5 items
    expect(items.length).toBe(5);

    expect(items[0]?.type).toBe('user');

    // Tool 1: read_file
    expect(items[1]?.type).toBe('tool');
    expect(items[1]?.id).toBe('tool-call-read');
    expect(items[1]?.toolData?.displayName).toBe('Read file');
    expect(items[1]?.toolData?.durationMs).toBe(80);
    expect(items[1]?.toolData?.status).toBe('completed');
    expect(items[1]?.toolData?.toolOutput).toBe('Read 100 lines');

    // Tool 2: grep (failed)
    expect(items[2]?.type).toBe('tool');
    expect(items[2]?.id).toBe('tool-call-grep');
    expect(items[2]?.toolData?.displayName).toBe('Grep pattern');
    expect(items[2]?.toolData?.durationMs).toBe(150);
    expect(items[2]?.toolData?.status).toBe('failed');
    expect(items[2]?.toolData?.error).toBe('Pattern not found');

    // Tool 3: write_file
    expect(items[3]?.type).toBe('tool');
    expect(items[3]?.id).toBe('tool-call-write');
    expect(items[3]?.toolData?.displayName).toBe('Write file');
    expect(items[3]?.toolData?.durationMs).toBe(45);
    expect(items[3]?.toolData?.status).toBe('completed');
    expect(items[3]?.toolData?.toolOutput).toBe('Wrote 10 lines to src/out.ts');

    expect(items[4]?.type).toBe('assistant');
  });
});
