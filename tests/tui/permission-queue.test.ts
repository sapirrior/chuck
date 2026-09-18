import { describe, expect, it } from 'bun:test';
import {
  PermissionQueue,
  type QueuedPermissionItem,
} from '../../src/tui/utils/permission-queue.js';

import type { BashPermissionRequest, FilePermissionRequest } from '../../src/tools/types.js';

describe('PermissionQueue Concurrency & Abort Orchestration (Section 32)', () => {
  it('displays request A, queues request B, and transitions B to active on A approval', async () => {
    const shown: string[] = [];
    let hiddenCount = 0;

    const queue = new PermissionQueue({
      onShow: (item) => shown.push(item.id),
      onHide: () => hiddenCount++,
    });

    const bashReq: BashPermissionRequest = {
      command: 'echo "hello"',
      explanation: 'test command',
    };
    const fileReq: FilePermissionRequest = {
      kind: 'create',
      filePath: 'test.txt',
      before: null,
      after: 'hello',
    };

    const promiseA = queue.enqueueBash(bashReq);
    const promiseB = queue.enqueueFile(fileReq);

    expect(shown).toEqual(['bash-1']);
    expect(queue.active?.id).toBe('bash-1');
    expect(queue.pendingCount).toBe(1);

    // Approve A
    queue.resolveActive(true);
    const resA = await promiseA;
    expect(resA).toEqual({ allowed: true });
    expect(hiddenCount).toBe(1);

    // B should now be shown
    expect(shown).toEqual(['bash-1', 'file-2']);
    expect(queue.active?.id).toBe('file-2');
    expect(queue.pendingCount).toBe(0);

    // Deny B
    queue.resolveActive(false);
    const resB = await promiseB;
    expect(resB).toEqual({ allowed: false });
    expect(hiddenCount).toBe(2);
    expect(queue.active).toBeNull();
  });

  it('handles File request first followed by Bash request', async () => {
    const shown: string[] = [];
    const queue = new PermissionQueue({
      onShow: (item) => shown.push(item.id),
      onHide: () => {},
    });

    const fileReq: FilePermissionRequest = {
      kind: 'edit',
      filePath: 'src/app.ts',
      before: 'const a = 1;',
      after: 'const a = 2;',
    };
    const bashReq: BashPermissionRequest = {
      command: 'npm test',
      explanation: 'run tests',
    };

    const promiseA = queue.enqueueFile(fileReq);
    const promiseB = queue.enqueueBash(bashReq);

    expect(shown).toEqual(['file-1']);
    queue.resolveActive(true);
    expect((await promiseA).allowed).toBe(true);

    expect(shown).toEqual(['file-1', 'bash-2']);
    queue.resolveActive(true);
    expect((await promiseB).allowed).toBe(true);
    expect(queue.active).toBeNull();
  });

  it('cancels active request when its abortSignal fires and advances to queued request', async () => {
    const shown: string[] = [];
    const queue = new PermissionQueue({
      onShow: (item) => shown.push(item.id),
      onHide: () => {},
    });

    const abortControllerA = new AbortController();
    const promiseA = queue.enqueueBash(
      { command: 'long-cmd', explanation: 'desc' },
      abortControllerA.signal,
    );
    const promiseB = queue.enqueueFile({
      kind: 'create',
      filePath: 'new.txt',
      before: null,
      after: 'text',
    });

    expect(queue.active?.id).toBe('bash-1');

    // Abort A while active
    abortControllerA.abort();
    const resA = await promiseA;
    expect(resA.allowed).toBe(false);

    // B becomes active immediately
    expect(queue.active?.id).toBe('file-2');
    expect(shown).toEqual(['bash-1', 'file-2']);

    queue.resolveActive(true);
    const resB = await promiseB;
    expect(resB.allowed).toBe(true);
  });

  it('removes queued request aborted before display without ever showing it', async () => {
    const shown: string[] = [];
    const queue = new PermissionQueue({
      onShow: (item) => shown.push(item.id),
      onHide: () => {},
    });

    const promiseA = queue.enqueueBash({ command: 'cmd1', explanation: 'desc' });
    const abortControllerB = new AbortController();
    const promiseB = queue.enqueueFile(
      { kind: 'create', filePath: 'b.txt', before: null, after: 'b' },
      abortControllerB.signal,
    );
    const promiseC = queue.enqueueBash({ command: 'cmd3', explanation: 'desc' });

    expect(queue.active?.id).toBe('bash-1');
    expect(queue.pendingCount).toBe(2);

    // Abort queued item B before it becomes active
    abortControllerB.abort();
    const resB = await promiseB;
    expect(resB.allowed).toBe(false);
    expect(queue.pendingCount).toBe(1);

    // Complete A
    queue.resolveActive(true);
    expect((await promiseA).allowed).toBe(true);

    // C becomes active, B was skipped completely
    expect(queue.active?.id).toBe('bash-3');
    expect(shown).toEqual(['bash-1', 'bash-3']);

    queue.resolveActive(true);
    expect((await promiseC).allowed).toBe(true);
    expect(queue.active).toBeNull();
  });

  it('clear() safely rejects both active and all queued requests', async () => {
    const shown: string[] = [];
    const queue = new PermissionQueue({
      onShow: (item) => shown.push(item.id),
      onHide: () => {},
    });

    const promiseA = queue.enqueueBash({ command: 'cmd1', explanation: 'desc' });
    const promiseB = queue.enqueueFile({
      kind: 'create',
      filePath: 'f.txt',
      before: null,
      after: 'f',
    });
    const promiseC = queue.enqueueBash({ command: 'cmd2', explanation: 'desc' });

    expect(queue.active?.id).toBe('bash-1');

    queue.clear();

    const [resA, resB, resC] = await Promise.all([promiseA, promiseB, promiseC]);
    expect(resA.allowed).toBe(false);
    expect(resB.allowed).toBe(false);
    expect(resC.allowed).toBe(false);
    expect(queue.active).toBeNull();
    expect(queue.pendingCount).toBe(0);
  });
});
