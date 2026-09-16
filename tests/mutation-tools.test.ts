import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileTool } from '../src/tools/write-file/index.js';
import { editFileTool } from '../src/tools/edit-file/index.js';
import { MutationCheckpointTracker } from '../src/checkpoint/tracker.js';
import { MutationLockManager } from '../src/checkpoint/lock.js';

describe('Mutation Tools (write_file & edit_file)', () => {
  let testDir: string;
  let workspaceDir: string;
  let checkpointsDir: string;
  let sessionsDir: string;
  let tracker: MutationCheckpointTracker;
  let lockManager: MutationLockManager;

  const origCheckpoints = process.env.STEWARD_CHECKPOINTS_DIR;
  const origSessions = process.env.STEWARD_SESSIONS_DIR;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `steward-mutation-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
    tracker = new MutationCheckpointTracker({
      workspaceRoot: workspaceDir,
      sessionId: 'test-session',
      lockManager,
    });
    await tracker.beginTurn('turn-1', 1);
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

  describe('write_file', () => {
    it('creates a new file in the workspace', async () => {
      const res = await writeFileTool.execute(
        { file_path: 'hello.txt', content: 'Hello World!' },
        { cwd: workspaceDir, checkpointTracker: tracker, mutationLocks: lockManager },
      );

      expect(res.isNew).toBe(true);
      expect(existsSync(join(workspaceDir, 'hello.txt'))).toBe(true);
      expect(readFileSync(join(workspaceDir, 'hello.txt'), 'utf-8')).toBe('Hello World!');
    });

    it('overwrites an existing file', async () => {
      writeFileSync(join(workspaceDir, 'existing.txt'), 'old text', 'utf-8');

      const res = await writeFileTool.execute(
        { file_path: 'existing.txt', content: 'new text' },
        { cwd: workspaceDir, checkpointTracker: tracker, mutationLocks: lockManager },
      );

      expect(res.isNew).toBe(false);
      expect(readFileSync(join(workspaceDir, 'existing.txt'), 'utf-8')).toBe('new text');
    });

    it('handles no-op write when content is identical', async () => {
      writeFileSync(join(workspaceDir, 'same.txt'), 'identical', 'utf-8');

      const res = await writeFileTool.execute(
        { file_path: 'same.txt', content: 'identical' },
        { cwd: workspaceDir, checkpointTracker: tracker, mutationLocks: lockManager },
      );

      expect(res.message).toContain('already matches');
    });

    it('rejects path traversal outside workspace', async () => {
      expect(
        writeFileTool.execute(
          { file_path: '../outside.txt', content: 'fail' },
          { cwd: workspaceDir, checkpointTracker: tracker, mutationLocks: lockManager },
        ),
      ).rejects.toThrow(/Access denied/);
    });
  });

  describe('edit_file', () => {
    it('replaces a unique occurrence of old_string', async () => {
      writeFileSync(
        join(workspaceDir, 'app.ts'),
        'const a = 1;\nconst b = 2;\nexport { a, b };',
        'utf-8',
      );

      const res = await editFileTool.execute(
        {
          file_path: 'app.ts',
          old_string: 'const b = 2;',
          new_string: 'const b = 20;',
        },
        { cwd: workspaceDir, checkpointTracker: tracker, mutationLocks: lockManager },
      );

      expect(res.replacementsMade).toBe(1);
      expect(readFileSync(join(workspaceDir, 'app.ts'), 'utf-8')).toBe(
        'const a = 1;\nconst b = 20;\nexport { a, b };',
      );
    });

    it('throws error if old_string is not found', async () => {
      writeFileSync(join(workspaceDir, 'app.ts'), 'const a = 1;', 'utf-8');

      expect(
        editFileTool.execute(
          {
            file_path: 'app.ts',
            old_string: 'const missing = true;',
            new_string: 'const present = true;',
          },
          { cwd: workspaceDir, checkpointTracker: tracker, mutationLocks: lockManager },
        ),
      ).rejects.toThrow(/not found/);
    });

    it('throws error if old_string matches multiple times and replace_all is false', async () => {
      writeFileSync(join(workspaceDir, 'multi.txt'), 'foo bar foo baz foo', 'utf-8');

      expect(
        editFileTool.execute(
          {
            file_path: 'multi.txt',
            old_string: 'foo',
            new_string: 'qux',
            replace_all: false,
          },
          { cwd: workspaceDir, checkpointTracker: tracker, mutationLocks: lockManager },
        ),
      ).rejects.toThrow(/matched 3 times/);
    });

    it('replaces multiple occurrences when replace_all is true', async () => {
      writeFileSync(join(workspaceDir, 'multi.txt'), 'foo bar foo baz foo', 'utf-8');

      const res = await editFileTool.execute(
        {
          file_path: 'multi.txt',
          old_string: 'foo',
          new_string: 'qux',
          replace_all: true,
        },
        { cwd: workspaceDir, checkpointTracker: tracker, mutationLocks: lockManager },
      );

      expect(res.replacementsMade).toBe(3);
      expect(readFileSync(join(workspaceDir, 'multi.txt'), 'utf-8')).toBe('qux bar qux baz qux');
    });

    it('rejects editing a nonexistent file', async () => {
      expect(
        editFileTool.execute(
          {
            file_path: 'nonexistent.txt',
            old_string: 'a',
            new_string: 'b',
          },
          { cwd: workspaceDir, checkpointTracker: tracker, mutationLocks: lockManager },
        ),
      ).rejects.toThrow(/does not exist/);
    });
  });
});
