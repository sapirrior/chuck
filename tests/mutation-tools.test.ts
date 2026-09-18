import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileTool } from '../src/tools/write-file/index.js';
import { editFileTool } from '../src/tools/edit-file/index.js';
import { MutationCheckpointTracker } from '../src/services/checkpoint/tracker.js';
import { MutationLockManager } from '../src/services/checkpoint/lock.js';
import type { FilePermissionRequest } from '../src/tools/types.js';

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

  describe('write_file permission & mutation semantics (Section 29)', () => {
    it('create + approve -> file created and checkpoint committed', async () => {
      let capturedRequest: FilePermissionRequest | null = null;

      const res = await writeFileTool.execute(
        { file_path: 'hello.txt', content: 'Hello World!\n' },
        {
          cwd: workspaceDir,
          checkpointTracker: tracker,
          mutationLocks: lockManager,
          requestFilePermission: async (req) => {
            capturedRequest = req;
            return { allowed: true };
          },
        },
      );

      expect(res.isNew).toBe(true);
      expect(existsSync(join(workspaceDir, 'hello.txt'))).toBe(true);
      expect(readFileSync(join(workspaceDir, 'hello.txt'), 'utf-8')).toBe('Hello World!\n');
      expect(capturedRequest).toEqual({
        kind: 'create',
        filePath: 'hello.txt',
        before: null,
        after: 'Hello World!\n',
      });
    });

    it('create + deny -> file remains absent and no checkpoint created', async () => {
      let promptFired = false;

      const promise = writeFileTool.execute(
        { file_path: 'denied.txt', content: 'Secret data' },
        {
          cwd: workspaceDir,
          checkpointTracker: tracker,
          mutationLocks: lockManager,
          requestFilePermission: async () => {
            promptFired = true;
            return { allowed: false };
          },
        },
      );

      await expect(promise).rejects.toThrow(/permission denied/i);
      expect(promptFired).toBe(true);
      expect(existsSync(join(workspaceDir, 'denied.txt'))).toBe(false);
    });

    it('overwrite + approve -> complete replacement occurs with overwrite kind', async () => {
      writeFileSync(join(workspaceDir, 'existing.txt'), 'old text', 'utf-8');
      let capturedRequest: FilePermissionRequest | null = null;

      const res = await writeFileTool.execute(
        { file_path: 'existing.txt', content: 'new text' },
        {
          cwd: workspaceDir,
          checkpointTracker: tracker,
          mutationLocks: lockManager,
          requestFilePermission: async (req) => {
            capturedRequest = req;
            return { allowed: true };
          },
        },
      );

      expect(res.isNew).toBe(false);
      expect(readFileSync(join(workspaceDir, 'existing.txt'), 'utf-8')).toBe('new text');
      expect(capturedRequest).toEqual({
        kind: 'overwrite',
        filePath: 'existing.txt',
        before: 'old text',
        after: 'new text',
      });
    });

    it('overwrite + deny -> original content remains intact', async () => {
      writeFileSync(join(workspaceDir, 'existing.txt'), 'original content', 'utf-8');

      const promise = writeFileTool.execute(
        { file_path: 'existing.txt', content: 'corrupted content' },
        {
          cwd: workspaceDir,
          checkpointTracker: tracker,
          mutationLocks: lockManager,
          requestFilePermission: async () => ({ allowed: false }),
        },
      );

      await expect(promise).rejects.toThrow(/permission denied/i);
      expect(readFileSync(join(workspaceDir, 'existing.txt'), 'utf-8')).toBe('original content');
    });

    it('same bytes (no-op) -> returns without permission prompt', async () => {
      writeFileSync(join(workspaceDir, 'same.txt'), 'identical content', 'utf-8');
      let promptFired = false;

      const res = await writeFileTool.execute(
        { file_path: 'same.txt', content: 'identical content' },
        {
          cwd: workspaceDir,
          checkpointTracker: tracker,
          mutationLocks: lockManager,
          requestFilePermission: async () => {
            promptFired = true;
            return { allowed: true };
          },
        },
      );

      expect(promptFired).toBe(false);
      expect(res.message).toContain('already matches');
    });

    it('fails closed when permission callback is absent', async () => {
      expect(
        writeFileTool.execute(
          { file_path: 'unattended.txt', content: 'text' },
          { cwd: workspaceDir, checkpointTracker: tracker, mutationLocks: lockManager },
        ),
      ).rejects.toThrow(/non-interactive/i);
      expect(existsSync(join(workspaceDir, 'unattended.txt'))).toBe(false);
    });

    it('rejects path traversal outside workspace', async () => {
      expect(
        writeFileTool.execute(
          { file_path: '../outside.txt', content: 'fail' },
          {
            cwd: workspaceDir,
            checkpointTracker: tracker,
            mutationLocks: lockManager,
            requestFilePermission: async () => ({ allowed: true }),
          },
        ),
      ).rejects.toThrow(/Access denied/);
    });
  });

  describe('edit_file permission & mutation semantics (Section 30)', () => {
    it('unique edit + approve -> exact replacement occurs', async () => {
      writeFileSync(
        join(workspaceDir, 'app.ts'),
        'const a = 1;\nconst b = 2;\nexport { a, b };\n',
        'utf-8',
      );
      let capturedRequest: FilePermissionRequest | null = null;

      const res = await editFileTool.execute(
        {
          file_path: 'app.ts',
          old_string: 'const b = 2;',
          new_string: 'const b = 20;',
        },
        {
          cwd: workspaceDir,
          checkpointTracker: tracker,
          mutationLocks: lockManager,
          requestFilePermission: async (req) => {
            capturedRequest = req;
            return { allowed: true };
          },
        },
      );

      expect(res.replacementsMade).toBe(1);
      expect(readFileSync(join(workspaceDir, 'app.ts'), 'utf-8')).toBe(
        'const a = 1;\nconst b = 20;\nexport { a, b };\n',
      );
      expect(capturedRequest).toEqual({
        kind: 'edit',
        filePath: 'app.ts',
        before: 'const a = 1;\nconst b = 2;\nexport { a, b };\n',
        after: 'const a = 1;\nconst b = 20;\nexport { a, b };\n',
      });
    });

    it('unique edit + deny -> original content remains', async () => {
      writeFileSync(join(workspaceDir, 'app.ts'), 'const a = 1;\n', 'utf-8');

      const promise = editFileTool.execute(
        {
          file_path: 'app.ts',
          old_string: 'const a = 1;',
          new_string: 'const a = 999;',
        },
        {
          cwd: workspaceDir,
          checkpointTracker: tracker,
          mutationLocks: lockManager,
          requestFilePermission: async () => ({ allowed: false }),
        },
      );

      await expect(promise).rejects.toThrow(/permission denied/i);
      expect(readFileSync(join(workspaceDir, 'app.ts'), 'utf-8')).toBe('const a = 1;\n');
    });

    it('old == new (no-op) -> returns without prompt', async () => {
      writeFileSync(join(workspaceDir, 'app.ts'), 'const a = 1;\n', 'utf-8');
      let promptFired = false;

      const res = await editFileTool.execute(
        {
          file_path: 'app.ts',
          old_string: 'const a = 1;',
          new_string: 'const a = 1;',
        },
        {
          cwd: workspaceDir,
          checkpointTracker: tracker,
          mutationLocks: lockManager,
          requestFilePermission: async () => {
            promptFired = true;
            return { allowed: true };
          },
        },
      );

      expect(promptFired).toBe(false);
      expect(res.replacementsMade).toBe(0);
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
        {
          cwd: workspaceDir,
          checkpointTracker: tracker,
          mutationLocks: lockManager,
          requestFilePermission: async () => ({ allowed: true }),
        },
      );

      expect(res.replacementsMade).toBe(3);
      expect(readFileSync(join(workspaceDir, 'multi.txt'), 'utf-8')).toBe('qux bar qux baz qux');
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
          {
            cwd: workspaceDir,
            checkpointTracker: tracker,
            mutationLocks: lockManager,
            requestFilePermission: async () => ({ allowed: true }),
          },
        ),
      ).rejects.toThrow(/not found/);
    });

    it('fails closed when permission callback is absent on edit', async () => {
      writeFileSync(join(workspaceDir, 'app.ts'), 'const a = 1;', 'utf-8');

      expect(
        editFileTool.execute(
          {
            file_path: 'app.ts',
            old_string: 'const a = 1;',
            new_string: 'const a = 2;',
          },
          { cwd: workspaceDir, checkpointTracker: tracker, mutationLocks: lockManager },
        ),
      ).rejects.toThrow(/non-interactive/i);
      expect(readFileSync(join(workspaceDir, 'app.ts'), 'utf-8')).toBe('const a = 1;');
    });
  });

  describe('External File Change Detection (Section 31)', () => {
    it('aborts safely if file is externally modified during approval window', async () => {
      const targetFile = join(workspaceDir, 'concurrency.txt');
      writeFileSync(targetFile, 'initial state', 'utf-8');

      const promise = editFileTool.execute(
        {
          file_path: 'concurrency.txt',
          old_string: 'initial state',
          new_string: 'approved state',
        },
        {
          cwd: workspaceDir,
          checkpointTracker: tracker,
          mutationLocks: lockManager,
          requestFilePermission: async () => {
            // Simulate external process modifying the file before user approval arrives
            writeFileSync(targetFile, 'external concurrent state', 'utf-8');
            return { allowed: true };
          },
        },
      );

      await expect(promise).rejects.toThrow(/modified externally during approval review/i);
      // Verify external state was preserved and NOT overwritten
      expect(readFileSync(targetFile, 'utf-8')).toBe('external concurrent state');
    });
  });

  describe('bash vs checkpoint boundary', () => {
    it('proves bash tool does not invoke checkpoint tracker', async () => {
      const { bashTool } = await import('../src/tools/bash/index.js');
      const { loadPendingJournal } = await import('../src/services/checkpoint/store.js');
      const { computeWorkspaceHash } = await import('../src/services/checkpoint/path.js');
      const testFile = join(workspaceDir, 'bash-mutated.txt');

      // Execute a bash mutation with approval
      await bashTool.execute(
        {
          command: `echo "shell line" > "${testFile}"`,
          explanation: 'Create file via shell',
        },
        {
          cwd: workspaceDir,
          checkpointTracker: tracker,
          mutationLocks: lockManager,
          requestBashPermission: async () => ({ allowed: true }),
        },
      );

      expect(existsSync(testFile)).toBe(true);

      // Verify that tracker journal has zero mutation entries recorded for bash
      const wsHash = computeWorkspaceHash(workspaceDir);
      const pending = loadPendingJournal(wsHash, 'test-session');
      expect(pending?.files?.length ?? 0).toBe(0);
    });
  });

  describe('edit_file summarize output', () => {
    it('formats human readable summary with colored diff lines', () => {
      const summary = editFileTool.summarize?.(
        {
          file_path: 'foo.ts',
          old_string: 'const a = 1;',
          new_string: 'const a = 2;\nconst b = 3;',
        },
        {
          success: true,
          filePath: 'foo.ts',
          modifiedBytes: 25,
          addedLines: 2,
          removedLines: 1,
        },
      );

      expect(summary).toBeDefined();
      expect(summary).toContain('Added 2 lines, removed 1 line');
      expect(summary).toContain('-const a = 1;');
      expect(summary).toContain('+const a = 2;');
      expect(summary).toContain('+const b = 3;');
    });
  });
});
