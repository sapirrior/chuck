import type { AudioRecorder, AudioRecorderEvents } from './types.js';
import { defaultCheckRecorder, defaultCheckArecord } from './prerequisites.js';

export interface RecorderProcess {
  stdout: ReadableStream<Uint8Array> | null;
  stderr?: ReadableStream<Uint8Array> | null;
  exited: Promise<number>;
  kill: (signal?: number | string) => void;
}

export type SpawnProcessFn = (
  cmd: string[],
  options: { stdout: 'pipe'; stderr: 'pipe' | 'ignore'; stdin: 'ignore' },
) => RecorderProcess;

export const DEFAULT_ARECORD_ARGS = [
  '-q',
  '-f',
  'S16_LE',
  '-r',
  '16000',
  '-c',
  '1',
  '-t',
  'raw',
  '-',
];

export class ArecordAudioRecorder implements AudioRecorder {
  private proc: RecorderProcess | null = null;
  private recording = false;
  private stopping = false;
  private spawnFn: SpawnProcessFn;
  private checkAvailableFn: () => Promise<boolean>;

  constructor(options?: { spawnFn?: SpawnProcessFn; checkAvailableFn?: () => Promise<boolean> }) {
    this.spawnFn =
      options?.spawnFn ??
      ((cmd, opts) => {
        const p = Bun.spawn(cmd, opts);
        return {
          stdout: p.stdout,
          stderr: p.stderr,
          exited: p.exited,
          kill: (sig) => p.kill(sig as any),
        };
      });
    this.checkAvailableFn = options?.checkAvailableFn ?? defaultCheckArecord;
  }

  public async isAvailable(): Promise<boolean> {
    return this.checkAvailableFn();
  }

  public get isRecording(): boolean {
    return this.recording;
  }

  public async start(events: AudioRecorderEvents): Promise<void> {
    if (this.recording) {
      throw new Error('Audio recorder is already running.');
    }

    this.recording = true;
    this.stopping = false;

    try {
      const isAvail = await this.isAvailable();
      if (!isAvail) {
        throw new Error('arecord is not installed or available on this system.');
      }

      const cmd = ['arecord', ...DEFAULT_ARECORD_ARGS];
      const proc = this.spawnFn(cmd, {
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
      });

      this.proc = proc;

      // Drain stderr in background so recorder errors or warnings do not corrupt the TUI
      if (proc.stderr) {
        (async () => {
          try {
            const reader = proc.stderr.getReader();
            while (true) {
              const { done } = await reader.read();
              if (done) break;
            }
          } catch {
            // Ignore stderr read errors
          }
        })();
      }

      // Stream stdout audio chunks
      if (!proc.stdout) {
        throw new Error('Failed to open audio stdout stream.');
      }

      const reader = proc.stdout.getReader();

      (async () => {
        try {
          while (this.recording) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.byteLength > 0) {
              events.onChunk(value);
            }
          }
        } catch (err: any) {
          if (!this.stopping && this.recording) {
            events.onError(err instanceof Error ? err : new Error(String(err)));
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {
            // Ignore
          }
        }
      })();

      // Watch for process exit
      proc.exited
        .then((code) => {
          const wasStopping = this.stopping;
          this.recording = false;
          this.proc = null;

          if (!wasStopping && code !== 0 && code !== 130 && code !== 143) {
            // Unexpected exit
            events.onError(
              new Error(`Audio capture process exited unexpectedly with code ${code}`),
            );
          }
          events.onExit(code, null);
        })
        .catch((err) => {
          this.recording = false;
          this.proc = null;
          if (!this.stopping) {
            events.onError(err instanceof Error ? err : new Error(String(err)));
          }
        });
    } catch (err: any) {
      this.recording = false;
      this.proc = null;
      throw err;
    }
  }

  public async stop(): Promise<void> {
    if (!this.recording || !this.proc) {
      this.recording = false;
      return;
    }

    this.stopping = true;
    this.recording = false;

    const proc = this.proc;
    try {
      proc.kill(2); // SIGINT to flush and finish cleanly
    } catch {
      // Ignore kill error
    }

    // Wait up to 1500ms for exit
    const timeout = new Promise<number>((resolve) => setTimeout(() => resolve(-1), 1500));
    const exited = await Promise.race([proc.exited, timeout]);

    if (exited === -1) {
      try {
        proc.kill(9); // Force kill if it didn't exit
      } catch {
        // Ignore
      }
    }

    this.proc = null;
    this.stopping = false;
  }

  public abort(): void {
    this.stopping = true;
    this.recording = false;
    if (this.proc) {
      try {
        this.proc.kill(9);
      } catch {
        // Ignore
      }
      this.proc = null;
    }
    this.stopping = false;
  }
}
