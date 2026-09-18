import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileTool } from '../src/tools/write-file/index.js';
import { editFileTool } from '../src/tools/edit-file/index.js';
import { MutationCheckpointTracker } from '../src/services/checkpoint/tracker.js';
import { MutationLockManager } from '../src/services/checkpoint/lock.js';
import { executeRewind } from '../src/services/checkpoint/rewind.js';
import { createSession, saveSession } from '../src/session/store.js';

describe('Definition of Done — Multi-Turn Parallel Mutation and Rewind Scenario (Section 33)', () => {
  let testDir: string;
  let workspaceDir: string;
  let checkpointsDir: string;
  let sessionsDir: string;
  let lockManager: MutationLockManager;

  const origCheckpoints = process.env.STEWARD_CHECKPOINTS_DIR;
  const origSessions = process.env.STEWARD_SESSIONS_DIR;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `steward-dod-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    workspaceDir = join(testDir, 'workspace');
    checkpointsDir = join(testDir, 'checkpoints');
    sessionsDir = join(testDir, 'sessions');

    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(checkpointsDir, { recursive: true });
    mkdirSync(sessionsDir, { recursive: true });

    process.env.STEWARD_CHECKPOINTS_DIR = checkpointsDir;
    process.env.STEWARD_SESSIONS_DIR = sessionsDir;

    lockManager = new MutationLockManager();
  });

  afterEach(() => {
    if (origCheckpoints) process.env.STEWARD_CHECKPOINTS_DIR = origCheckpoints;
    else delete process.env.STEWARD_CHECKPOINTS_DIR;

    if (origSessions) process.env.STEWARD_SESSIONS_DIR = origSessions;
    else delete process.env.STEWARD_SESSIONS_DIR;

    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('executes full 3-turn multi-file scenario and rewinds to Turn 1 accurately', async () => {
    const sessionId = 'session-dod-1';
    const session = createSession(
      { provider: 'anthropic', modelId: 'claude-3-5-sonnet-latest' },
      sessionId,
    );

    const fileA = join(workspaceDir, 'A.txt');
    const fileB = join(workspaceDir, 'B.txt');

    // === Turn 1 ===
    // user: "Create A and B"
    // parallel tool calls: write_file(A), write_file(B)
    const tracker1 = new MutationCheckpointTracker({
      workspaceRoot: workspaceDir,
      sessionId,
      lockManager,
    });
    await tracker1.beginTurn('turn-1', 1);

    const toolCtx1 = {
      cwd: workspaceDir,
      checkpointTracker: tracker1,
      mutationLocks: lockManager,
      requestFilePermission: async () => ({ allowed: true }),
    };

    await Promise.all([
      writeFileTool.execute({ file_path: 'A.txt', content: 'Initial A content' }, toolCtx1),
      writeFileTool.execute({ file_path: 'B.txt', content: 'Initial B content' }, toolCtx1),
    ]);

    await tracker1.commitTurn('turn-1', 'complete');

    session.turns.push({
      id: 'turn-1',
      timestamp: new Date().toISOString(),
      status: 'complete',
      usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      messages: [{ role: 'user', content: 'Create A and B' }],
    });
    session.totalUsage = {
      inputTokens: 50,
      outputTokens: 100,
      totalTokens: 150,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    saveSession(session);

    expect(readFileSync(fileA, 'utf-8')).toBe('Initial A content');
    expect(readFileSync(fileB, 'utf-8')).toBe('Initial B content');

    // === Turn 2 ===
    // user: "Edit A twice and replace B"
    // tool calls: edit_file(A), edit_file(A), write_file(B)
    const tracker2 = new MutationCheckpointTracker({
      workspaceRoot: workspaceDir,
      sessionId,
      lockManager,
    });
    await tracker2.beginTurn('turn-2', 2);

    const toolCtx2 = {
      cwd: workspaceDir,
      checkpointTracker: tracker2,
      mutationLocks: lockManager,
      requestFilePermission: async () => ({ allowed: true }),
    };

    // Parallel calls: two edits on A (serialized internally) + one write on B (concurrent with A)
    await Promise.all([
      editFileTool.execute(
        {
          file_path: 'A.txt',
          old_string: 'Initial A content',
          new_string: 'Intermediate A content',
        },
        toolCtx2,
      ),
      writeFileTool.execute({ file_path: 'B.txt', content: 'Replaced B content' }, toolCtx2),
    ]);

    // Second edit on A
    await editFileTool.execute(
      {
        file_path: 'A.txt',
        old_string: 'Intermediate A content',
        new_string: 'Final Turn-2 A content',
      },
      toolCtx2,
    );

    await tracker2.commitTurn('turn-2', 'complete');

    session.turns.push({
      id: 'turn-2',
      timestamp: new Date().toISOString(),
      status: 'complete',
      usage: { inputTokens: 60, outputTokens: 120, totalTokens: 180 },
      messages: [{ role: 'user', content: 'Edit A twice and replace B' }],
    });
    session.totalUsage.inputTokens += 60;
    session.totalUsage.outputTokens += 120;
    session.totalUsage.totalTokens += 180;
    saveSession(session);

    expect(readFileSync(fileA, 'utf-8')).toBe('Final Turn-2 A content');
    expect(readFileSync(fileB, 'utf-8')).toBe('Replaced B content');

    // === Turn 3 ===
    // user: "Make another change"
    // tool call: edit_file(A)
    const tracker3 = new MutationCheckpointTracker({
      workspaceRoot: workspaceDir,
      sessionId,
      lockManager,
    });
    await tracker3.beginTurn('turn-3', 3);

    const toolCtx3 = {
      cwd: workspaceDir,
      checkpointTracker: tracker3,
      mutationLocks: lockManager,
      requestFilePermission: async () => ({ allowed: true }),
    };

    await editFileTool.execute(
      { file_path: 'A.txt', old_string: 'Final Turn-2 A content', new_string: 'Turn-3 A content' },
      toolCtx3,
    );

    await tracker3.commitTurn('turn-3', 'complete');

    session.turns.push({
      id: 'turn-3',
      timestamp: new Date().toISOString(),
      status: 'complete',
      usage: { inputTokens: 40, outputTokens: 80, totalTokens: 120 },
      messages: [{ role: 'user', content: 'Make another change' }],
    });
    session.totalUsage.inputTokens += 40;
    session.totalUsage.outputTokens += 80;
    session.totalUsage.totalTokens += 120;
    saveSession(session);

    expect(readFileSync(fileA, 'utf-8')).toBe('Turn-3 A content');
    expect(session.turns.length).toBe(3);
    expect(session.totalUsage.totalTokens).toBe(450);

    // === /rewind before Turn 2 (keeping Turn 1) ===
    const rewindRes = await executeRewind({
      session,
      targetTurnId: 'turn-2',
      workspaceRoot: workspaceDir,
      lockManager,
    });

    expect(rewindRes.success).toBe(true);

    // Verify outcomes:
    // 1. Conversation contains only Turn 1
    expect(session.turns.length).toBe(1);
    expect(session.turns[0].id).toBe('turn-1');
    expect(session.turns[0].messages[0].content).toBe('Create A and B');

    // 2. A and B exactly match their Turn-1 end states
    expect(readFileSync(fileA, 'utf-8')).toBe('Initial A content');
    expect(readFileSync(fileB, 'utf-8')).toBe('Initial B content');

    // 3. Usage equals Turn-1 usage
    expect(session.totalUsage.inputTokens).toBe(50);
    expect(session.totalUsage.outputTokens).toBe(100);
    expect(session.totalUsage.totalTokens).toBe(150);

    // 4. All discarded turns are absent
    expect(session.turns.find((t) => t.id === 'turn-2')).toBeUndefined();
    expect(session.turns.find((t) => t.id === 'turn-3')).toBeUndefined();
  });

  it('rejects rewind as a conflict if file is modified externally after checkpoint', async () => {
    const sessionId = 'session-dod-conflict';
    const session = createSession(
      { provider: 'anthropic', modelId: 'claude-3-5-sonnet-latest' },
      sessionId,
    );

    const fileA = join(workspaceDir, 'A.txt');

    // Turn 1
    const tracker1 = new MutationCheckpointTracker({
      workspaceRoot: workspaceDir,
      sessionId,
      lockManager,
    });
    await tracker1.beginTurn('turn-1', 1);
    const toolCtx1 = {
      cwd: workspaceDir,
      checkpointTracker: tracker1,
      mutationLocks: lockManager,
      requestFilePermission: async () => ({ allowed: true }),
    };
    await writeFileTool.execute({ file_path: 'A.txt', content: 'A0' }, toolCtx1);
    await tracker1.commitTurn('turn-1', 'complete');

    session.turns.push({
      id: 'turn-1',
      timestamp: new Date().toISOString(),
      status: 'complete',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      messages: [{ role: 'user', content: 'Create A' }],
    });

    // Turn 2
    const tracker2 = new MutationCheckpointTracker({
      workspaceRoot: workspaceDir,
      sessionId,
      lockManager,
    });
    await tracker2.beginTurn('turn-2', 2);
    const toolCtx2 = {
      cwd: workspaceDir,
      checkpointTracker: tracker2,
      mutationLocks: lockManager,
      requestFilePermission: async () => ({ allowed: true }),
    };
    await editFileTool.execute(
      { file_path: 'A.txt', old_string: 'A0', new_string: 'A1' },
      toolCtx2,
    );
    await tracker2.commitTurn('turn-2', 'complete');

    session.turns.push({
      id: 'turn-2',
      timestamp: new Date().toISOString(),
      status: 'complete',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      messages: [{ role: 'user', content: 'Edit A' }],
    });

    // External process modifies A.txt
    writeFileSync(fileA, 'A1-external-manual-change', 'utf-8');

    // Attempt rewind before Turn 2
    const rewindRes = await executeRewind({
      session,
      targetTurnId: 'turn-2',
      workspaceRoot: workspaceDir,
      lockManager,
    });

    // Verify conflict safety:
    expect(rewindRes.success).toBe(false);
    if (!rewindRes.success) {
      expect(rewindRes.error).toContain('Conflict detected');
    }
    // No file is overwritten
    expect(readFileSync(fileA, 'utf-8')).toBe('A1-external-manual-change');
    // No session history is truncated
    expect(session.turns.length).toBe(2);
  });
});
