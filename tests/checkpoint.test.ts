import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeCasBlob,
  readCasBlob,
  hasCasBlob,
  verifyCasBlob,
  computeSha256,
} from '../src/services/checkpoint/cas.js';
import {
  computeWorkspaceHash,
  resolveDirectMutationPath,
} from '../src/services/checkpoint/path.js';
import { MutationLockManager } from '../src/services/checkpoint/lock.js';
import { MutationCheckpointTracker } from '../src/services/checkpoint/tracker.js';
import {
  loadCheckpointManifest,
  saveCheckpointManifest,
  loadPendingJournal,
} from '../src/services/checkpoint/store.js';
import { executeRewind } from '../src/services/checkpoint/rewind.js';
import { createSession } from '../src/session/store.js';

describe('Checkpoint Core (CAS, Path, Lock, Tracker, Rewind)', () => {
  let testDir: string;
  let workspaceDir: string;
  let checkpointsDir: string;
  let sessionsDir: string;
  const origCheckpoints = process.env.STEWARD_CHECKPOINTS_DIR;
  const origSessions = process.env.STEWARD_SESSIONS_DIR;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `steward-cp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    workspaceDir = join(testDir, 'workspace');
    checkpointsDir = join(testDir, 'checkpoints');
    sessionsDir = join(testDir, 'sessions');

    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(checkpointsDir, { recursive: true });
    mkdirSync(sessionsDir, { recursive: true });

    process.env.STEWARD_CHECKPOINTS_DIR = checkpointsDir;
    process.env.STEWARD_SESSIONS_DIR = sessionsDir;
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

  describe('CAS (Content-Addressed Store)', () => {
    it('writes and reads blobs correctly', () => {
      const wsHash = 'testws123';
      const content = 'hello world content';
      const expectedSha = computeSha256(Buffer.from(content, 'utf-8'));

      const result = writeCasBlob(wsHash, content);
      expect(result.sha256).toBe(expectedSha);
      expect(hasCasBlob(wsHash, expectedSha)).toBe(true);
      expect(verifyCasBlob(wsHash, expectedSha)).toBe(true);

      const readBack = readCasBlob(wsHash, expectedSha);
      expect(readBack.toString('utf-8')).toBe(content);
    });

    it('deduplicates identical content', () => {
      const wsHash = 'testws123';
      const content = 'same content';
      const res1 = writeCasBlob(wsHash, content);
      const res2 = writeCasBlob(wsHash, content);
      expect(res1.sha256).toBe(res2.sha256);
      expect(res1.path).toBe(res2.path);
    });
  });

  describe('Path Resolution & Safety', () => {
    it('allows valid relative and absolute paths inside workspace', () => {
      const rel = resolveDirectMutationPath(workspaceDir, 'src/app.ts');
      expect(rel.relativePath).toBe('src/app.ts');
      expect(rel.absolutePath).toBe(join(workspaceDir, 'src/app.ts'));

      const abs = resolveDirectMutationPath(workspaceDir, join(workspaceDir, 'package.json'));
      expect(abs.relativePath).toBe('package.json');
    });

    it('rejects path traversal escaping workspace', () => {
      expect(() => {
        resolveDirectMutationPath(workspaceDir, '../secret.txt');
      }).toThrow(/Access denied/);

      expect(() => {
        resolveDirectMutationPath(workspaceDir, 'sub/../../outside.txt');
      }).toThrow(/Access denied/);
    });

    it('rejects directory targets', () => {
      const subDir = join(workspaceDir, 'subfolder');
      mkdirSync(subDir, { recursive: true });

      expect(() => {
        resolveDirectMutationPath(workspaceDir, 'subfolder');
      }).toThrow(/directory/);
    });
  });

  describe('MutationLockManager', () => {
    it('serializes locks for the same path while running distinct paths concurrently', async () => {
      const lockManager = new MutationLockManager();
      const pathA = join(workspaceDir, 'a.txt');
      const pathB = join(workspaceDir, 'b.txt');

      const events: string[] = [];

      const op1 = async () => {
        const release = await lockManager.acquire(pathA);
        events.push('op1 start A');
        await new Promise((r) => setTimeout(r, 20));
        events.push('op1 end A');
        release();
      };

      const op2 = async () => {
        const release = await lockManager.acquire(pathA);
        events.push('op2 start A');
        events.push('op2 end A');
        release();
      };

      const op3 = async () => {
        const release = await lockManager.acquire(pathB);
        events.push('op3 start B');
        events.push('op3 end B');
        release();
      };

      await Promise.all([op1(), op2(), op3()]);

      // op3 on B can run while op1 is holding A
      expect(events.indexOf('op1 start A')).toBeLessThan(events.indexOf('op1 end A'));
      expect(events.indexOf('op1 end A')).toBeLessThan(events.indexOf('op2 start A'));
    });
  });

  describe('MutationCheckpointTracker', () => {
    it('tracks single-turn pre-states and post-states correctly', async () => {
      const tracker = new MutationCheckpointTracker({
        workspaceRoot: workspaceDir,
        sessionId: 'session-test-1',
      });

      const fileA = join(workspaceDir, 'a.txt');
      writeFileSync(fileA, 'initial-A', 'utf-8');

      await tracker.beginTurn('turn-1', 1);

      const prep = await tracker.prepareMutation('a.txt');
      expect(prep.preState.kind).toBe('file');
      if (prep.preState.kind === 'file') {
        expect(prep.preState.size).toBe(Buffer.byteLength('initial-A'));
      }

      // Perform write
      writeFileSync(fileA, 'updated-A', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();

      await tracker.commitTurn('turn-1');

      const manifest = loadCheckpointManifest(computeWorkspaceHash(workspaceDir), 'session-test-1');
      expect(manifest).not.toBeNull();
      expect(manifest?.turns.length).toBe(1);
      expect(manifest?.turns[0].files[0].relativePath).toBe('a.txt');
      expect(manifest?.turns[0].files[0].pre.kind).toBe('file');
      expect(manifest?.turns[0].files[0].post?.kind).toBe('file');
    });

    it('captures pre = missing for new files', async () => {
      const tracker = new MutationCheckpointTracker({
        workspaceRoot: workspaceDir,
        sessionId: 'session-test-2',
      });

      const fileNew = join(workspaceDir, 'new.txt');

      await tracker.beginTurn('turn-1', 1);

      const prep = await tracker.prepareMutation('new.txt');
      expect(prep.preState.kind).toBe('missing');

      writeFileSync(fileNew, 'created-content', 'utf-8');
      await tracker.completeMutation('new.txt');
      prep.releaseLock();

      await tracker.commitTurn('turn-1');

      const manifest = loadCheckpointManifest(computeWorkspaceHash(workspaceDir), 'session-test-2');
      expect(manifest?.turns[0].files[0].pre.kind).toBe('missing');
      expect(manifest?.turns[0].files[0].post?.kind).toBe('file');
    });
  });

  describe('Rewind Execution', () => {
    it('Test A — selected turn itself is discarded', async () => {
      const tracker = new MutationCheckpointTracker({
        workspaceRoot: workspaceDir,
        sessionId: 'test-a-session',
      });

      const session = createSession(
        { provider: 'anthropic', modelId: 'claude-3-5-sonnet-latest' },
        'test-a-session',
      );

      const fileA = join(workspaceDir, 'a.txt');
      writeFileSync(fileA, 'A0', 'utf-8');

      // Turn 1: A0 -> A1
      await tracker.beginTurn('turn-1', 1);
      let prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A1', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-1');

      session.turns.push({
        id: 'turn-1',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'Turn 1 prompt' }],
      });

      // Turn 2: A1 -> A2
      await tracker.beginTurn('turn-2', 2);
      prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A2', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-2');

      session.turns.push({
        id: 'turn-2',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 },
        messages: [{ role: 'user', content: 'Turn 2 prompt' }],
      });

      // Turn 3: A2 -> A3
      await tracker.beginTurn('turn-3', 3);
      prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A3', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-3');

      session.turns.push({
        id: 'turn-3',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50 },
        messages: [{ role: 'user', content: 'Turn 3 prompt' }],
      });

      expect(readFileSync(fileA, 'utf-8')).toBe('A3');

      // Select Turn 2 (rewind before Turn 2, discarding Turn 2 and Turn 3)
      const rewindRes = await executeRewind({
        session,
        targetTurnId: 'turn-2',
        workspaceRoot: workspaceDir,
      });

      expect(rewindRes.success).toBe(true);
      if (rewindRes.success) {
        expect(rewindRes.discardedTurnsCount).toBe(2);
      }
      expect(readFileSync(fileA, 'utf-8')).toBe('A1');
      expect(session.turns.length).toBe(1);
      expect(session.turns[0].id).toBe('turn-1');
      expect(session.totalUsage.totalTokens).toBe(30);

      // Verify manifest synchronized
      const manifest = loadCheckpointManifest(computeWorkspaceHash(workspaceDir), 'test-a-session');
      expect(manifest?.turns.map((t) => t.turnId)).toEqual(['turn-1']);
    });

    it('Test B — last turn is rewindable', async () => {
      const tracker = new MutationCheckpointTracker({
        workspaceRoot: workspaceDir,
        sessionId: 'test-b-session',
      });

      const session = createSession(
        { provider: 'anthropic', modelId: 'claude-3-5-sonnet-latest' },
        'test-b-session',
      );

      const fileA = join(workspaceDir, 'a.txt');
      writeFileSync(fileA, 'A0', 'utf-8');

      // Turn 1: A0 -> A1
      await tracker.beginTurn('turn-1', 1);
      let prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A1', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-1');

      session.turns.push({
        id: 'turn-1',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'Turn 1 prompt' }],
      });

      // Turn 2: A1 -> A2
      await tracker.beginTurn('turn-2', 2);
      prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A2', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-2');

      session.turns.push({
        id: 'turn-2',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'Turn 2 prompt' }],
      });

      // Turn 3: A2 -> A3
      await tracker.beginTurn('turn-3', 3);
      prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A3', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-3');

      session.turns.push({
        id: 'turn-3',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'Turn 3 prompt' }],
      });

      // Select Turn 3 (discards Turn 3, keeps Turn 1 and Turn 2)
      const rewindRes = await executeRewind({
        session,
        targetTurnId: 'turn-3',
        workspaceRoot: workspaceDir,
      });

      expect(rewindRes.success).toBe(true);
      expect(session.turns.map((t) => t.id)).toEqual(['turn-1', 'turn-2']);
      expect(readFileSync(fileA, 'utf-8')).toBe('A2');
    });

    it('Test C — multiple files restoration', async () => {
      const tracker = new MutationCheckpointTracker({
        workspaceRoot: workspaceDir,
        sessionId: 'test-c-session',
      });

      const session = createSession(
        { provider: 'anthropic', modelId: 'claude-3-5-sonnet-latest' },
        'test-c-session',
      );

      const fileA = join(workspaceDir, 'a.txt');
      const fileB = join(workspaceDir, 'b.txt');
      const fileC = join(workspaceDir, 'c.txt');

      writeFileSync(fileA, 'A0', 'utf-8');
      writeFileSync(fileB, 'B0', 'utf-8');
      writeFileSync(fileC, 'C0', 'utf-8');

      // Turn 1: A0 -> A1, B0 -> B1
      await tracker.beginTurn('turn-1', 1);
      let prepA = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A1', 'utf-8');
      await tracker.completeMutation('a.txt');
      prepA.releaseLock();

      let prepB = await tracker.prepareMutation('b.txt');
      writeFileSync(fileB, 'B1', 'utf-8');
      await tracker.completeMutation('b.txt');
      prepB.releaseLock();
      await tracker.commitTurn('turn-1');

      session.turns.push({
        id: 'turn-1',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'T1' }],
      });

      // Turn 2: A1 -> A2
      await tracker.beginTurn('turn-2', 2);
      prepA = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A2', 'utf-8');
      await tracker.completeMutation('a.txt');
      prepA.releaseLock();
      await tracker.commitTurn('turn-2');

      session.turns.push({
        id: 'turn-2',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'T2' }],
      });

      // Turn 3: B1 -> B2, C0 -> C1
      await tracker.beginTurn('turn-3', 3);
      prepB = await tracker.prepareMutation('b.txt');
      writeFileSync(fileB, 'B2', 'utf-8');
      await tracker.completeMutation('b.txt');
      prepB.releaseLock();

      let prepC = await tracker.prepareMutation('c.txt');
      writeFileSync(fileC, 'C1', 'utf-8');
      await tracker.completeMutation('c.txt');
      prepC.releaseLock();
      await tracker.commitTurn('turn-3');

      session.turns.push({
        id: 'turn-3',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'T3' }],
      });

      // Select Turn 2 (rewind before Turn 2)
      const rewindRes = await executeRewind({
        session,
        targetTurnId: 'turn-2',
        workspaceRoot: workspaceDir,
      });

      expect(rewindRes.success).toBe(true);
      expect(readFileSync(fileA, 'utf-8')).toBe('A1');
      expect(readFileSync(fileB, 'utf-8')).toBe('B1');
      expect(readFileSync(fileC, 'utf-8')).toBe('C0');
      expect(session.turns.map((t) => t.id)).toEqual(['turn-1']);
    });

    it('Test D — repeated mutation of one file restores oldest discarded preimage', async () => {
      const tracker = new MutationCheckpointTracker({
        workspaceRoot: workspaceDir,
        sessionId: 'test-d-session',
      });

      const session = createSession(
        { provider: 'anthropic', modelId: 'claude-3-5-sonnet-latest' },
        'test-d-session',
      );

      const fileA = join(workspaceDir, 'a.txt');
      writeFileSync(fileA, 'A0', 'utf-8');

      // T1: A0 -> A1
      await tracker.beginTurn('turn-1', 1);
      let prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A1', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-1');
      session.turns.push({
        id: 'turn-1',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'T1' }],
      });

      // T2: A1 -> A2
      await tracker.beginTurn('turn-2', 2);
      prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A2', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-2');
      session.turns.push({
        id: 'turn-2',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'T2' }],
      });

      // T3: A2 -> A3
      await tracker.beginTurn('turn-3', 3);
      prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A3', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-3');
      session.turns.push({
        id: 'turn-3',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'T3' }],
      });

      // T4: A3 -> A4
      await tracker.beginTurn('turn-4', 4);
      prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A4', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-4');
      session.turns.push({
        id: 'turn-4',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'T4' }],
      });

      // Select Turn 2
      const rewindRes = await executeRewind({
        session,
        targetTurnId: 'turn-2',
        workspaceRoot: workspaceDir,
      });

      expect(rewindRes.success).toBe(true);
      expect(readFileSync(fileA, 'utf-8')).toBe('A1');
      expect(session.turns.map((t) => t.id)).toEqual(['turn-1']);
    });

    it('Test E — legacy session fails closed before any mutation', async () => {
      const session = createSession(
        { provider: 'anthropic', modelId: 'claude-3-5-sonnet-latest' },
        'legacy-session',
      );

      session.turns.push(
        {
          id: 'turn-1',
          timestamp: new Date().toISOString(),
          status: 'complete',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          messages: [{ role: 'user', content: 'Legacy 1' }],
        },
        {
          id: 'turn-2',
          timestamp: new Date().toISOString(),
          status: 'complete',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          messages: [{ role: 'user', content: 'Legacy 2' }],
        },
      );

      const fileA = join(workspaceDir, 'a.txt');
      writeFileSync(fileA, 'legacy-content', 'utf-8');

      // Attempt rewind on session with no checkpoint manifest
      const rewindRes = await executeRewind({
        session,
        targetTurnId: 'turn-2',
        workspaceRoot: workspaceDir,
      });

      expect(rewindRes.success).toBe(false);
      if (!rewindRes.success) {
        expect(rewindRes.error).toContain('unavailable');
      }
      expect(readFileSync(fileA, 'utf-8')).toBe('legacy-content');
      expect(session.turns.length).toBe(2);
    });

    it('Test F — mixed legacy and checkpointed session', async () => {
      const tracker = new MutationCheckpointTracker({
        workspaceRoot: workspaceDir,
        sessionId: 'mixed-session',
      });

      const session = createSession(
        { provider: 'anthropic', modelId: 'claude-3-5-sonnet-latest' },
        'mixed-session',
      );

      const fileA = join(workspaceDir, 'a.txt');
      writeFileSync(fileA, 'A0', 'utf-8');

      // Legacy turns (no checkpoints recorded)
      session.turns.push(
        {
          id: 'turn-1',
          timestamp: new Date().toISOString(),
          status: 'complete',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          messages: [{ role: 'user', content: 'Old 1' }],
        },
        {
          id: 'turn-2',
          timestamp: new Date().toISOString(),
          status: 'complete',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          messages: [{ role: 'user', content: 'Old 2' }],
        },
      );

      // Turn 3: checkpointed A0 -> A3
      await tracker.beginTurn('turn-3', 3);
      let prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A3', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-3');
      session.turns.push({
        id: 'turn-3',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'New 3' }],
      });

      // Turn 4: checkpointed A3 -> A4
      await tracker.beginTurn('turn-4', 4);
      prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A4', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-4');
      session.turns.push({
        id: 'turn-4',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'New 4' }],
      });

      // Selecting Turn 2 requires crossing uncheckpointed boundary -> reject
      const rejectedRes = await executeRewind({
        session,
        targetTurnId: 'turn-2',
        workspaceRoot: workspaceDir,
      });
      expect(rejectedRes.success).toBe(false);
      expect(readFileSync(fileA, 'utf-8')).toBe('A4');
      expect(session.turns.length).toBe(4);

      // Selecting Turn 4 is fully within checkpointed region -> allowed
      const allowedRes = await executeRewind({
        session,
        targetTurnId: 'turn-4',
        workspaceRoot: workspaceDir,
      });
      expect(allowedRes.success).toBe(true);
      expect(readFileSync(fileA, 'utf-8')).toBe('A3');
      expect(session.turns.map((t) => t.id)).toEqual(['turn-1', 'turn-2', 'turn-3']);
    });

    it('Test G — resume session then mutate then rewind', async () => {
      const tracker1 = new MutationCheckpointTracker({
        workspaceRoot: workspaceDir,
        sessionId: 'resume-test-session',
      });

      const session = createSession(
        { provider: 'anthropic', modelId: 'claude-3-5-sonnet-latest' },
        'resume-test-session',
      );

      const fileA = join(workspaceDir, 'a.txt');
      writeFileSync(fileA, 'Initial', 'utf-8');

      // Turn 1
      await tracker1.beginTurn('turn-1', 1);
      let prep = await tracker1.prepareMutation('a.txt');
      writeFileSync(fileA, 'After-Turn-1', 'utf-8');
      await tracker1.completeMutation('a.txt');
      prep.releaseLock();
      await tracker1.commitTurn('turn-1');
      session.turns.push({
        id: 'turn-1',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'Turn 1' }],
      });

      // Simulate resume: new tracker instance with same workspace and session
      const tracker2 = new MutationCheckpointTracker({
        workspaceRoot: workspaceDir,
        sessionId: 'resume-test-session',
      });

      // Turn 2
      await tracker2.beginTurn('turn-2', 2);
      prep = await tracker2.prepareMutation('a.txt');
      writeFileSync(fileA, 'After-Turn-2', 'utf-8');
      await tracker2.completeMutation('a.txt');
      prep.releaseLock();
      await tracker2.commitTurn('turn-2');
      session.turns.push({
        id: 'turn-2',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'Turn 2' }],
      });

      // Rewind before Turn 2
      const rewindRes = await executeRewind({
        session,
        targetTurnId: 'turn-2',
        workspaceRoot: workspaceDir,
      });

      expect(rewindRes.success).toBe(true);
      expect(readFileSync(fileA, 'utf-8')).toBe('After-Turn-1');
      expect(session.turns.map((t) => t.id)).toEqual(['turn-1']);
    });

    it('Test H — concurrent multi-file mutations in one turn', async () => {
      const lockManager = new MutationLockManager();
      const tracker = new MutationCheckpointTracker({
        workspaceRoot: workspaceDir,
        sessionId: 'concurrent-session',
        lockManager,
      });

      const session = createSession(
        { provider: 'anthropic', modelId: 'claude-3-5-sonnet-latest' },
        'concurrent-session',
      );

      const fileA = join(workspaceDir, 'a.txt');
      const fileB = join(workspaceDir, 'b.txt');
      const fileC = join(workspaceDir, 'c.txt');

      writeFileSync(fileA, 'A0', 'utf-8');
      writeFileSync(fileB, 'B0', 'utf-8');
      writeFileSync(fileC, 'C0', 'utf-8');

      // Turn 1
      await tracker.beginTurn('turn-1', 1);
      const mutate = async (relPath: string, content: string) => {
        const prep = await tracker.prepareMutation(relPath);
        writeFileSync(join(workspaceDir, relPath), content, 'utf-8');
        await tracker.completeMutation(relPath);
        prep.releaseLock();
      };

      await Promise.all([mutate('a.txt', 'A1'), mutate('b.txt', 'B1'), mutate('c.txt', 'C1')]);

      await tracker.commitTurn('turn-1');
      session.turns.push({
        id: 'turn-1',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'Turn 1' }],
      });

      // Rewind before Turn 1
      const rewindRes = await executeRewind({
        session,
        targetTurnId: 'turn-1',
        workspaceRoot: workspaceDir,
        lockManager,
      });

      expect(rewindRes.success).toBe(true);
      expect(readFileSync(fileA, 'utf-8')).toBe('A0');
      expect(readFileSync(fileB, 'utf-8')).toBe('B0');
      expect(readFileSync(fileC, 'utf-8')).toBe('C0');
      expect(session.turns.length).toBe(0);
    });

    it('detects external modifications and aborts rewind before touching files', async () => {
      const tracker = new MutationCheckpointTracker({
        workspaceRoot: workspaceDir,
        sessionId: 'conflict-session',
      });

      const session = createSession(
        { provider: 'anthropic', modelId: 'claude-3-5-sonnet-latest' },
        'conflict-session',
      );

      const fileA = join(workspaceDir, 'a.txt');
      writeFileSync(fileA, 'A0', 'utf-8');

      // Turn 1
      await tracker.beginTurn('turn-1', 1);
      let prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A1', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-1');

      session.turns.push({
        id: 'turn-1',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'Turn 1 prompt' }],
      });

      // Turn 2
      await tracker.beginTurn('turn-2', 2);
      prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'A2', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-2');

      session.turns.push({
        id: 'turn-2',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'Turn 2 prompt' }],
      });

      // External edit occurs after Turn 2
      writeFileSync(fileA, 'A2-external-modification', 'utf-8');

      // Attempt rewind before Turn 2
      const rewindRes = await executeRewind({
        session,
        targetTurnId: 'turn-2',
        workspaceRoot: workspaceDir,
      });

      expect(rewindRes.success).toBe(false);
      if (!rewindRes.success) {
        expect(rewindRes.error).toContain('Conflict detected');
      }
      // File content must be preserved untouched
      expect(readFileSync(fileA, 'utf-8')).toBe('A2-external-modification');
      // Session turns must remain intact
      expect(session.turns.length).toBe(2);
    });
  });

  describe('Rewind Line Diff Counts', () => {
    it('computes accurate additions and deletions for line diffs', async () => {
      const { computeLineDiffCounts } = await import('../src/tui/components/docks/RewindMenu.js');

      // 1. Identical content
      expect(computeLineDiffCounts('hello\nworld', 'hello\nworld')).toEqual({
        added: 0,
        deleted: 0,
      });

      // 2. Pure addition (new file)
      expect(computeLineDiffCounts('', 'line1\nline2\nline3')).toEqual({
        added: 3,
        deleted: 0,
      });

      // 3. Pure deletion
      expect(computeLineDiffCounts('line1\nline2\nline3', '')).toEqual({
        added: 0,
        deleted: 3,
      });

      // 4. Single line modification (1 deletion + 1 addition)
      expect(
        computeLineDiffCounts('const a = 1;\nconst b = 2;\n', 'const a = 1;\nconst b = 20;\n'),
      ).toEqual({
        added: 1,
        deleted: 1,
      });

      // 5. Mixed insertions and deletions
      const oldCode = 'function foo() {\n  return 1;\n}\n';
      const newCode = 'function foo() {\n  const x = 10;\n  const y = 20;\n  return x + y;\n}\n';
      expect(computeLineDiffCounts(oldCode, newCode)).toEqual({
        added: 3,
        deleted: 1,
      });
    });

    it('buildRewindItems calculates added and deleted lines from CAS blobs', async () => {
      const { buildRewindItems } = await import('../src/tui/components/docks/RewindMenu.js');

      const tracker = new MutationCheckpointTracker({
        workspaceRoot: workspaceDir,
        sessionId: 'diff-stat-session',
      });

      const session = createSession(
        { provider: 'anthropic', modelId: 'claude-3-5-sonnet-latest' },
        'diff-stat-session',
      );

      const fileA = join(workspaceDir, 'a.txt');

      // Turn 1: create a.txt with 3 lines
      await tracker.beginTurn('turn-1', 1);
      let prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'line 1\nline 2\nline 3\n', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-1');

      session.turns.push({
        id: 'turn-1',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'Create a.txt' }],
      });

      // Turn 2: edit a.txt (modify 1 line, add 2 lines)
      await tracker.beginTurn('turn-2', 2);
      prep = await tracker.prepareMutation('a.txt');
      writeFileSync(fileA, 'line 1\nline 2 modified\nline 3\nline 4\nline 5\n', 'utf-8');
      await tracker.completeMutation('a.txt');
      prep.releaseLock();
      await tracker.commitTurn('turn-2');

      session.turns.push({
        id: 'turn-2',
        timestamp: new Date().toISOString(),
        status: 'complete',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        messages: [{ role: 'user', content: 'Edit a.txt' }],
      });

      const items = buildRewindItems(session, workspaceDir);
      expect(items.length).toBe(2);

      // Turn 1: 1 file changed, +4 lines (including trailing newline split), 0 deleted
      expect(items[0].hasCodeChanges).toBe(true);
      expect(items[0].changedFileCount).toBe(1);
      expect(items[0].addedLines).toBe(4);
      expect(items[0].deletedLines).toBe(0);

      // Turn 2: 1 file changed, +3 lines, -1 deleted
      expect(items[1].hasCodeChanges).toBe(true);
      expect(items[1].changedFileCount).toBe(1);
      expect(items[1].addedLines).toBe(3);
      expect(items[1].deletedLines).toBe(1);
    });
  });
});
