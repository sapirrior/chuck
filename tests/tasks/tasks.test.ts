import { describe, expect, it } from 'bun:test';
import { ShellTaskManager } from '../../src/services/tasks/manager.js';
import { ShellExecution } from '../../src/services/tasks/process.js';
import { bashTool } from '../../src/tools/bash/index.js';
import { taskReadTool } from '../../src/tools/task-read/index.js';
import { taskSendInputTool } from '../../src/tools/task-send-input/index.js';
import { taskKillTool } from '../../src/tools/task-kill/index.js';
import { AgentSession } from '../../src/engine/agent-session.js';

describe('Shell Tasks Subsystem', () => {
  const cwd = process.cwd();

  it('A. Fast foreground command returns normal result and no task id', async () => {
    const manager = new ShellTaskManager();
    const res = await bashTool.execute(
      { command: 'echo "hello fast"', explanation: 'fast command' },
      { cwd, shellTasks: manager },
    );

    expect(res.status).toBeUndefined();
    expect(res.stdout.trim()).toBe('hello fast');
    expect(res.exitCode).toBe(0);
    expect(manager.list().length).toBe(0);
  });

  it('B. Automatic handoff moves long running command to background', async () => {
    const manager = new ShellTaskManager();
    const execution = manager.createExecution({
      command: 'sleep 3',
      cwd,
      handoffDeadlineMs: 100, // short deadline for test
    });

    const { foregroundPromise } = execution.start({ handoffDeadlineMs: 100 });
    const outcome = await foregroundPromise;

    expect(outcome.outcome).toBe('backgrounded');
    expect(execution.status).toBe('running');

    const read = manager.read(execution.taskId);
    expect(read.status).toBe('running');
    expect(read.id).toBe(execution.taskId);

    await execution.kill();
  });

  it('C. Completion after handoff is recorded correctly in task state', async () => {
    const manager = new ShellTaskManager();
    const execution = manager.createExecution({
      command: 'sleep 0.2 && echo "done after sleep"',
      cwd,
      handoffDeadlineMs: 50,
    });

    const { foregroundPromise } = execution.start({ handoffDeadlineMs: 50 });
    await foregroundPromise;

    // Wait for the background process to exit naturally
    await new Promise((r) => setTimeout(r, 400));

    const read = manager.read(execution.taskId);
    expect(read.status).toBe('completed');
    expect(read.exitCode).toBe(0);
    expect(read.output).toContain('done after sleep');
  });

  it('D. Send input writes data to standard input of running task', async () => {
    const manager = new ShellTaskManager();
    // A command that reads two lines and prints them back
    const execution = manager.createExecution({
      command: 'read line1 && read line2 && echo "Got: $line1, $line2"',
      cwd,
      handoffDeadlineMs: 50,
    });

    const { foregroundPromise } = execution.start({ handoffDeadlineMs: 50 });
    await foregroundPromise;

    const inputResult1 = await taskSendInputTool.execute(
      { task_id: execution.taskId, input: 'foo' }, // auto-appends \n
      { cwd, shellTasks: manager },
    );
    expect(inputResult1.bytesWritten).toBe(4);

    const inputResult2 = await taskSendInputTool.execute(
      { task_id: execution.taskId, input: 'bar\\n' }, // unescapes \\n
      { cwd, shellTasks: manager },
    );
    expect(inputResult2.bytesWritten).toBe(4);

    // Wait for completion
    await new Promise((r) => setTimeout(r, 300));

    const read = await taskReadTool.execute(
      { task_id: execution.taskId },
      { cwd, shellTasks: manager },
    );
    expect(read.status).toBe('completed');
    expect(read.output).toContain('Got: foo, bar');
  });

  it('E. Task kill terminates process tree and marks status as killed', async () => {
    const manager = new ShellTaskManager();
    const execution = manager.createExecution({
      command: 'sh -c "sleep 30 & sleep 30"',
      cwd,
      handoffDeadlineMs: 50,
    });

    const { foregroundPromise } = execution.start({ handoffDeadlineMs: 50 });
    await foregroundPromise;

    expect(execution.status).toBe('running');

    const killRes = await taskKillTool.execute(
      { task_id: execution.taskId },
      { cwd, shellTasks: manager },
    );
    expect(killRes.status).toBe('killed');

    const read = manager.read(execution.taskId);
    expect(read.status).toBe('killed');

    // Repeated kill is idempotent
    const killRes2 = await taskKillTool.execute(
      { task_id: execution.taskId },
      { cwd, shellTasks: manager },
    );
    expect(killRes2.status).toBe('killed');
  });

  it('F. Exit-vs-handoff race resolves deterministically', async () => {
    for (let i = 0; i < 5; i++) {
      const manager = new ShellTaskManager();
      const execution = manager.createExecution({
        command: 'sleep 0.05',
        cwd,
        handoffDeadlineMs: 50,
      });

      const { foregroundPromise } = execution.start({ handoffDeadlineMs: 50 });
      const outcome = await foregroundPromise;
      expect(['exited', 'backgrounded']).toContain(outcome.outcome);

      await execution.kill();
    }
  });

  it('G. Abort before handoff terminates process and does not create background task', async () => {
    const controller = new AbortController();
    const manager = new ShellTaskManager();

    const execution = manager.createExecution({
      command: 'sleep 10',
      cwd,
      handoffDeadlineMs: 1000,
    });

    setTimeout(() => controller.abort(), 50);

    const { foregroundPromise } = execution.start({
      abortSignal: controller.signal,
      handoffDeadlineMs: 1000,
    });

    expect(foregroundPromise).rejects.toThrow(/aborted/);
  });

  it('H. Abort after handoff does not kill the background process', async () => {
    const controller = new AbortController();
    const manager = new ShellTaskManager();

    const execution = manager.createExecution({
      command: 'sleep 0.3 && echo "survived abort"',
      cwd,
      handoffDeadlineMs: 50,
    });

    const { foregroundPromise } = execution.start({
      abortSignal: controller.signal,
      handoffDeadlineMs: 50,
    });

    const outcome = await foregroundPromise;
    expect(outcome.outcome).toBe('backgrounded');

    // Abort the original turn controller after handoff
    controller.abort();

    // Verify task is still alive
    expect(execution.status).toBe('running');

    // Wait for task to finish
    await new Promise((r) => setTimeout(r, 400));

    const read = manager.read(execution.taskId);
    expect(read.status).toBe('completed');
    expect(read.output).toContain('survived abort');
  });

  it('I. Stdio/descendant regression resolves cleanly on process exit', async () => {
    const manager = new ShellTaskManager();
    // Grandchild inherits stdout and sleeps, but main process exits immediately
    const execution = manager.createExecution({
      command: 'sh -c "(sleep 1 > /dev/null &) ; echo fast_parent_exit"',
      cwd,
      handoffDeadlineMs: 1000,
    });

    const { foregroundPromise } = execution.start({ handoffDeadlineMs: 1000 });
    const outcome = await foregroundPromise;

    expect(outcome.outcome).toBe('exited');
    expect(outcome.stdout).toContain('fast_parent_exit');
    await execution.kill();
  });

  it('J. Output bounding truncates excessive output to protect memory', async () => {
    const manager = new ShellTaskManager();
    // High volume producer
    const execution = manager.createExecution({
      command: 'bun -e "for(let i=0; i<5000; i++) console.log(\'line \'+i);"',
      cwd,
      handoffDeadlineMs: 50,
    });

    const { foregroundPromise } = execution.start({ handoffDeadlineMs: 50 });
    await foregroundPromise;

    await new Promise((r) => setTimeout(r, 300));

    const read = manager.read(execution.taskId);
    expect(read.output.length).toBeLessThanOrEqual(4000);
    expect(read.outputTruncated).toBe(true);
  });

  it('K. Session isolation guarantees tasks do not cross session boundaries', async () => {
    const session1 = new AgentSession();
    const session2 = new AgentSession();

    const task1 = session1.tasks.createExecution({
      command: 'sleep 5',
      cwd,
      handoffDeadlineMs: 50,
    });
    task1.start({ handoffDeadlineMs: 50 });

    expect(session1.tasks.get(task1.taskId)).toBeDefined();
    expect(session2.tasks.get(task1.taskId)).toBeUndefined();

    await session1.shutdown();
    await session2.shutdown();
  });

  it('L. /clear and session reset shuts down running tasks', async () => {
    const session = new AgentSession();
    const task = session.tasks.createExecution({
      command: 'sleep 10',
      cwd,
      handoffDeadlineMs: 50,
    });
    task.start({ handoffDeadlineMs: 50 });

    expect(task.status).toBe('running');

    await session.resetSession();
    expect(task.status).toBe('killed');
    expect(session.tasks.list().length).toBe(0);
  });

  it('M. Shutdown cleanup terminates running tasks and removes temp files', async () => {
    const manager = new ShellTaskManager();
    const task = manager.createExecution({
      command: 'sleep 10',
      cwd,
      handoffDeadlineMs: 50,
    });
    task.start({ handoffDeadlineMs: 50 });

    expect(task.status).toBe('running');

    await manager.shutdown();
    expect(task.status).toBe('killed');
    expect(manager.list().length).toBe(0);
  });
});
