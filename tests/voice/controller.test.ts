import { describe, expect, it } from 'bun:test';
import {
  ArecordAudioRecorder,
  GeminiLiveTranscriptionSession,
  VoiceController,
  type RecorderProcess,
} from '../../src/voice/index.js';

class FakeWebSocket {
  public static OPEN = 1;
  public readyState = 1;
  public sent: string[] = [];
  public onopen?: () => void;
  public onmessage?: (evt: { data: string }) => void;
  public onerror?: (evt: any) => void;
  public onclose?: (evt: { code: number; reason?: string }) => void;

  constructor(public url: string) {
    setTimeout(() => {
      this.onopen?.();
    }, 5);
  }

  send(data: string): void {
    this.sent.push(data);
    const parsed = JSON.parse(data);

    // Auto respond to setup
    if (parsed.setup) {
      setTimeout(() => {
        this.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
      }, 5);
    }

    if (parsed.realtimeInput?.audioStreamEnd) {
      setTimeout(() => {
        this.onmessage?.({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
      }, 5);
    }
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: 'Normal Closure' });
  }

  emitTranscript(text: string, isFinal: boolean): void {
    this.onmessage?.({
      data: JSON.stringify({
        serverContent: {
          inputTranscription: {
            text,
            isFinal,
          },
        },
      }),
    });
  }

  emitError(msg: string): void {
    this.onerror?.({ message: msg });
  }
}

describe('Voice Recorder & Controller Integration with Mocks', () => {
  describe('ArecordAudioRecorder', () => {
    it('streams audio chunks and handles stop cleanly without leaking', async () => {
      let killedWithSignal: any = null;
      let exitResolve: (code: number) => void;

      const fakeProcess: RecorderProcess = {
        stdout: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3, 4]));
            controller.enqueue(new Uint8Array([5, 6, 7, 8]));
          },
        }),
        stderr: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
        exited: new Promise<number>((resolve) => {
          exitResolve = resolve;
        }),
        kill: (sig) => {
          killedWithSignal = sig;
          exitResolve?.(0);
        },
      };

      const chunksReceived: Uint8Array[] = [];
      const recorder = new ArecordAudioRecorder({
        spawnFn: () => fakeProcess,
        checkAvailableFn: async () => true,
      });

      expect(await recorder.isAvailable()).toBe(true);

      await recorder.start({
        onChunk: (chunk) => chunksReceived.push(chunk),
        onError: () => {},
        onExit: () => {},
      });

      expect(recorder.isRecording).toBe(true);
      await recorder.stop();

      expect(recorder.isRecording).toBe(false);
      expect(killedWithSignal).toBe(2); // SIGINT
    });
  });

  describe('GeminiLiveTranscriptionSession', () => {
    it('connects, sends setup, and receives interim and final transcripts', async () => {
      let activeWs: FakeWebSocket | null = null;
      const session = new GeminiLiveTranscriptionSession({
        apiKey: 'fake-api-key',
        wsFactory: (url) => {
          activeWs = new FakeWebSocket(url);
          return activeWs as any;
        },
      });

      const events: any[] = [];
      await session.connect({
        onTranscript: (evt) => events.push(evt),
        onError: () => {},
        onClose: () => {},
      });

      expect(session.isConnected).toBe(true);
      expect(activeWs?.sent.length).toBe(1); // Setup message sent

      // Send audio chunk
      session.sendAudio(new Uint8Array([10, 20, 30]));
      expect(activeWs?.sent.length).toBe(2);

      // Server emits transcript
      activeWs?.emitTranscript('Run bun test', true);
      expect(events.length).toBe(1);
      expect(events[0]).toEqual({ text: 'Run bun test', isFinal: true });

      session.close();
      expect(session.isConnected).toBe(false);
    });
  });

  describe('VoiceController Full Lifecycle & Failure Preservation', () => {
    it('handles full record -> stop cycle with transcript output', async () => {
      let activeWs: FakeWebSocket | null = null;

      let procExitedResolve: (code: number) => void;
      const fakeProcess: RecorderProcess = {
        stdout: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
          },
        }),
        exited: new Promise<number>((resolve) => {
          procExitedResolve = resolve;
        }),
        kill: () => {
          procExitedResolve?.(0);
        },
      };

      const stateTransitions: string[] = [];
      let finalResult: any = null;

      const controller = new VoiceController({
        prerequisites: {
          config: { geminiApiKey: 'mock-key', custom: {} },
          checkArecordFn: async () => true,
        },
        spawnFn: () => fakeProcess,
        wsFactory: (url) => {
          activeWs = new FakeWebSocket(url);
          return activeWs as any;
        },
        onStateChange: (state) => stateTransitions.push(state),
        onComplete: (res) => {
          finalResult = res;
        },
      });

      await controller.start();
      expect(controller.getState()).toBe('recording');

      activeWs?.emitTranscript('Fix the bug in auth', false);
      activeWs?.emitTranscript('Fix the bug in authentication', true);

      const stopResult = await controller.stop();
      expect(stopResult.ok).toBe(true);
      expect(stopResult.transcript).toBe('Fix the bug in authentication');
      expect(finalResult?.transcript).toBe('Fix the bug in authentication');
      expect(controller.getState()).toBe('idle');
    });

    it('PRESERVES accumulated draft on network disconnection or error (Section 15)', async () => {
      let activeWs: FakeWebSocket | null = null;

      const fakeProcess: RecorderProcess = {
        stdout: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
          },
        }),
        exited: new Promise<number>((resolve) => {}),
        kill: () => {},
      };

      let warningReceived = '';
      let completionResult: any = null;

      const controller = new VoiceController({
        prerequisites: {
          config: { geminiApiKey: 'mock-key', custom: {} },
          checkArecordFn: async () => true,
        },
        spawnFn: () => fakeProcess,
        wsFactory: (url) => {
          activeWs = new FakeWebSocket(url);
          return activeWs as any;
        },
        onWarning: (w) => {
          warningReceived = w;
        },
        onComplete: (res) => {
          completionResult = res;
        },
      });

      await controller.start();
      expect(controller.getState()).toBe('recording');

      // Transcript received before drop
      activeWs?.emitTranscript('Refactor authentication flow', true);
      activeWs?.emitTranscript('so that token rotation', false);

      // Simulate unexpected WebSocket network crash
      activeWs?.emitError('WebSocket connection lost: ECONNRESET');

      expect(controller.getState()).toBe('idle');
      expect(warningReceived).toContain('network connection lost');
      expect(completionResult.ok).toBe(false);
      expect(completionResult.transcript).toBe(
        'Refactor authentication flow so that token rotation',
      );
    });

    it('PRESERVES accumulated draft on 429 rate limit error', async () => {
      let activeWs: FakeWebSocket | null = null;

      const fakeProcess: RecorderProcess = {
        stdout: new ReadableStream<Uint8Array>({
          start(controller) {},
        }),
        exited: new Promise<number>((resolve) => {}),
        kill: () => {},
      };

      let warningReceived = '';
      let completionResult: any = null;

      const controller = new VoiceController({
        prerequisites: {
          config: { geminiApiKey: 'mock-key', custom: {} },
          checkArecordFn: async () => true,
        },
        spawnFn: () => fakeProcess,
        wsFactory: (url) => {
          activeWs = new FakeWebSocket(url);
          return activeWs as any;
        },
        onWarning: (w) => {
          warningReceived = w;
        },
        onComplete: (res) => {
          completionResult = res;
        },
      });

      await controller.start();
      activeWs?.emitTranscript('Analyze the code', true);

      // Simulate 429
      activeWs?.emitError('HTTP 429: RESOURCE_EXHAUSTED Quota exceeded');

      expect(controller.getState()).toBe('idle');
      expect(warningReceived).toContain('Gemini rate limit reached');
      expect(completionResult.ok).toBe(false);
      expect(completionResult.transcript).toBe('Analyze the code');
    });
  });
});
