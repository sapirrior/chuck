import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { boundResultText } from '../../utils/bounding.js';

import { ShellExecution, type ShellExecutionOptions } from './process.js';
import type {
  ShellTask,
  ShellTaskKillResult,
  ShellTaskReadResult,
  ShellTaskSendInputResult,
  ShellTaskStatus,
} from './types.js';

export const TASK_RETENTION_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL for terminal tasks
export const MAX_RETAINED_TERMINAL_TASKS = 50;

export class ShellTaskManager {
  private tasks = new Map<string, ShellExecution>();
  private terminalTimestamps = new Map<string, number>();
  private isShuttingDown = false;

  /**
   * Generates a random collision-resistant task ID.
   */
  public generateTaskId(): string {
    return `task-${randomBytes(4).toString('hex')}`;
  }

  /**
   * Creates and registers a new ShellExecution.
   */
  public createExecution(
    options: Omit<ShellExecutionOptions, 'taskId'> & { taskId?: string },
  ): ShellExecution {
    this.evictExpiredTasks();
    const taskId = options.taskId ?? this.generateTaskId();
    const execution = new ShellExecution({
      ...options,
      taskId,
    });
    this.tasks.set(taskId, execution);
    return execution;
  }

  /**
   * Registers an already-instantiated ShellExecution into the registry.
   */
  public register(execution: ShellExecution): void {
    this.evictExpiredTasks();
    this.tasks.set(execution.taskId, execution);
  }

  /**
   * Retrieves task metadata snapshot by ID.
   */
  public get(taskId: string): ShellTask | undefined {
    this.evictExpiredTasks();
    const exec = this.tasks.get(taskId);
    if (!exec) return undefined;
    return this.toTaskSnapshot(exec);
  }

  /**
   * Returns a list of all active or retained tasks.
   */
  public list(): ShellTask[] {
    this.evictExpiredTasks();
    return Array.from(this.tasks.values()).map((exec) => this.toTaskSnapshot(exec));
  }

  /**
   * Reads task status and recent bounded output snapshot.
   */
  public read(taskId: string): ShellTaskReadResult {
    this.evictExpiredTasks();
    const exec = this.tasks.get(taskId);
    if (!exec) {
      throw new Error(`Task "${taskId}" not found or expired.`);
    }

    const rawOutput = exec.getRecentOutput();
    const { preview, truncated } = boundResultText(rawOutput);

    return {
      id: exec.taskId,
      status: exec.status,
      command: exec.command,
      cwd: exec.cwd,
      startedAt: exec.startedAt,
      endedAt: exec.endedAt,
      exitCode: exec.exitCode,
      output: preview,
      outputTruncated: truncated || exec.outputTruncated,
      stdinOpen: exec.isStdinOpen,
    };
  }

  /**
   * Sends input to standard input of a running task.
   */
  public async sendInput(taskId: string, input: string): Promise<ShellTaskSendInputResult> {
    this.evictExpiredTasks();
    const exec = this.tasks.get(taskId);
    if (!exec) {
      throw new Error(`Task "${taskId}" not found or expired.`);
    }

    if (!exec.isRunning) {
      throw new Error(`Task "${taskId}" is not running (status: ${exec.status}).`);
    }

    const bytesWritten = await exec.sendInput(input);
    const rawOutput = exec.getRecentOutput();
    const { preview, truncated } = boundResultText(rawOutput);

    return {
      id: exec.taskId,
      status: exec.status,
      bytesWritten,
      output: preview,
      outputTruncated: truncated || exec.outputTruncated,
      message: `Successfully wrote ${bytesWritten} bytes to task ${taskId} stdin.`,
    };
  }

  /**
   * Terminates a task process tree and updates its state to killed.
   */
  public async kill(taskId: string): Promise<ShellTaskKillResult> {
    this.evictExpiredTasks();
    const exec = this.tasks.get(taskId);
    if (!exec) {
      throw new Error(`Task "${taskId}" not found or expired.`);
    }

    if (exec.isRunning) {
      await exec.kill();
    }

    return {
      id: exec.taskId,
      status: exec.status,
      command: exec.command,
      message: `Task ${taskId} terminated (status: ${exec.status}).`,
    };
  }

  /**
   * Shuts down all tasks and terminates active child processes idempotently.
   */
  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    const promises: Promise<void>[] = [];
    for (const exec of this.tasks.values()) {
      if (exec.isRunning) {
        promises.push(exec.kill());
      }
    }
    await Promise.allSettled(promises);

    for (const exec of this.tasks.values()) {
      try {
        if (exec.outputPath) {
          rmSync(exec.outputPath, { force: true });
        }
      } catch {}
    }

    this.tasks.clear();
    this.terminalTimestamps.clear();
    this.isShuttingDown = false;
  }

  private toTaskSnapshot(exec: ShellExecution): ShellTask {
    const rawOutput = exec.getRecentOutput();
    const { preview, truncated } = boundResultText(rawOutput);

    return {
      id: exec.taskId,
      status: exec.status,
      command: exec.command,
      cwd: exec.cwd,
      startedAt: exec.startedAt,
      endedAt: exec.endedAt,
      exitCode: exec.exitCode,
      outputPath: exec.outputPath,
      output: preview,
      outputTruncated: truncated || exec.outputTruncated,
      stdinOpen: exec.isStdinOpen,
      pid: exec.pid,
    };
  }

  private evictExpiredTasks(): void {
    const now = Date.now();
    const terminalIds: string[] = [];

    for (const [id, exec] of this.tasks.entries()) {
      if (!exec.isRunning) {
        if (!this.terminalTimestamps.has(id)) {
          this.terminalTimestamps.set(id, now);
        }
        terminalIds.push(id);
      }
    }

    // Evict based on TTL
    for (const id of terminalIds) {
      const finishedTime = this.terminalTimestamps.get(id) ?? now;
      if (now - finishedTime > TASK_RETENTION_TTL_MS) {
        const exec = this.tasks.get(id);
        if (exec?.outputPath) {
          try {
            rmSync(exec.outputPath, { force: true });
          } catch {}
        }
        this.tasks.delete(id);
        this.terminalTimestamps.delete(id);
      }
    }

    // Evict based on capacity limit (oldest terminal first)
    const remainingTerminal = Array.from(this.terminalTimestamps.entries()).sort(
      (a, b) => a[1] - b[1],
    );

    while (remainingTerminal.length > MAX_RETAINED_TERMINAL_TASKS) {
      const [oldestId] = remainingTerminal.shift()!;
      const exec = this.tasks.get(oldestId);
      if (exec?.outputPath) {
        try {
          rmSync(exec.outputPath, { force: true });
        } catch {}
      }
      this.tasks.delete(oldestId);
      this.terminalTimestamps.delete(oldestId);
    }
  }
}
