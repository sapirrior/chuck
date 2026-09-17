import { logError } from '../errors/index.js';
import { checkVoicePrerequisites, type PrerequisiteOptions } from './prerequisites.js';
import { ParecAudioRecorder, type SpawnProcessFn } from './recorder.js';
import { GeminiLiveTranscriptionSession, type WebSocketFactory } from './live-transcription.js';
import { TranscriptAccumulator } from './transcript.js';
import { classifyVoiceError } from './errors.js';
import type { AudioRecorder, LiveTranscriptionSession, VoiceResult, VoiceState } from './types.js';

export const MAX_RECORDING_DURATION_MS = 10 * 60 * 1000; // 10 minutes max ceiling
export const FINALIZATION_GRACE_PERIOD_MS = 4000; // 4s grace period for final transcript

export interface VoiceControllerOptions {
  prerequisites?: PrerequisiteOptions;
  spawnFn?: SpawnProcessFn;
  wsFactory?: WebSocketFactory;
  maxDurationMs?: number;
  gracePeriodMs?: number;
  language?: string;
  onStateChange?: (state: VoiceState) => void;
  onTranscriptChange?: (text: string, isFinal: boolean) => void;
  onComplete?: (result: VoiceResult) => void;
  onWarning?: (warning: string) => void;
}

export class VoiceController {
  private state: VoiceState = 'idle';
  private accumulator = new TranscriptAccumulator();
  private recorder: AudioRecorder | null = null;
  private liveSession: LiveTranscriptionSession | null = null;
  private sessionToken = 0;
  private maxDurationTimer: NodeJS.Timeout | null = null;
  private options: VoiceControllerOptions;

  constructor(options: VoiceControllerOptions = {}) {
    this.options = options;
  }

  public getState(): VoiceState {
    return this.state;
  }

  public get isActive(): boolean {
    return this.state === 'preparing' || this.state === 'recording' || this.state === 'finalizing';
  }

  public get isRecording(): boolean {
    return this.state === 'recording';
  }

  private setState(newState: VoiceState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.options.onStateChange?.(newState);
  }

  /**
   * Starts a voice dictation session.
   */
  public async start(): Promise<VoiceResult | undefined> {
    if (this.state === 'preparing' || this.state === 'recording') {
      // Double toggle during active session -> stop
      return this.stop();
    }
    if (this.state === 'finalizing') {
      return;
    }

    const currentToken = ++this.sessionToken;
    this.accumulator.clear();
    this.setState('preparing');

    try {
      // 1. Check prerequisites
      const preflight = await checkVoicePrerequisites(this.options.prerequisites);
      if (currentToken !== this.sessionToken) return;

      if (!preflight.ok || !preflight.apiKey) {
        const warning = preflight.warning || 'Voice unavailable: prerequisites not met';
        this.options.onWarning?.(warning);
        this.setState('idle');
        const result: VoiceResult = {
          ok: false,
          transcript: '',
          warning,
          category: preflight.reason ?? 'unknown',
        };
        this.options.onComplete?.(result);
        return result;
      }

      // 2. Setup Live transcription session
      const liveSession = new GeminiLiveTranscriptionSession({
        apiKey: preflight.apiKey,
        wsFactory: this.options.wsFactory,
        language: this.options.language,
      });
      this.liveSession = liveSession;

      // 3. Setup Recorder
      const recorder = new ParecAudioRecorder({
        spawnFn: this.options.spawnFn,
      });
      this.recorder = recorder;

      // 4. Connect Live WebSocket
      await liveSession.connect({
        onTranscript: (event) => {
          if (currentToken !== this.sessionToken) return;
          const currentVisible = this.accumulator.addEvent(event);
          this.options.onTranscriptChange?.(currentVisible, event.isFinal);
        },
        onError: (err) => {
          if (currentToken !== this.sessionToken) return;
          this.handleFailure(err, currentToken);
        },
        onClose: (code, reason) => {
          if (currentToken !== this.sessionToken) return;
          if (code !== 1000 && this.state === 'recording') {
            this.handleFailure(
              new Error(`WebSocket closed unexpectedly (code ${code}: ${reason})`),
              currentToken,
            );
          }
        },
      });

      if (currentToken !== this.sessionToken) {
        liveSession.close();
        return;
      }

      // 5. Start audio capture
      await recorder.start({
        onChunk: (chunk) => {
          if (currentToken !== this.sessionToken) return;
          liveSession.sendAudio(chunk);
        },
        onError: (err) => {
          if (currentToken !== this.sessionToken) return;
          this.handleFailure(err, currentToken);
        },
        onExit: (_code) => {
          // Process exited
        },
      });

      if (currentToken !== this.sessionToken) {
        recorder.abort();
        liveSession.close();
        return;
      }

      // 6. Transition to recording
      this.setState('recording');

      // 7. Enforce max recording ceiling
      const maxMs = this.options.maxDurationMs ?? MAX_RECORDING_DURATION_MS;
      this.clearMaxDurationTimer();
      this.maxDurationTimer = setTimeout(() => {
        if (currentToken === this.sessionToken && this.state === 'recording') {
          this.options.onWarning?.('Voice stopped: maximum recording duration reached');
          this.stop();
        }
      }, maxMs);
    } catch (err: any) {
      if (currentToken === this.sessionToken) {
        return this.handleFailure(err, currentToken);
      }
    }
  }

  /**
   * Stops the active voice recording and finalizes transcription.
   */
  public async stop(): Promise<VoiceResult> {
    this.clearMaxDurationTimer();

    if (this.state === 'idle' || this.state === 'finalizing') {
      return {
        ok: true,
        transcript: this.accumulator.getFinalizedText(),
      };
    }

    if (this.state === 'preparing') {
      this.sessionToken++;
      if (this.recorder) {
        this.recorder.abort();
        this.recorder = null;
      }
      if (this.liveSession) {
        this.liveSession.close();
        this.liveSession = null;
      }
      this.setState('idle');
      const result: VoiceResult = {
        ok: true,
        transcript: '',
      };
      this.options.onComplete?.(result);
      return result;
    }

    this.setState('finalizing');

    const recorder = this.recorder;
    const liveSession = this.liveSession;

    // 1. Stop audio recorder first
    if (recorder) {
      try {
        await recorder.stop();
      } catch {
        recorder.abort();
      }
    }

    // 2. Signal end of stream to Live session
    if (liveSession) {
      liveSession.endActivity();

      // 3. Wait for final transcription events with grace period
      const graceMs = this.options.gracePeriodMs ?? FINALIZATION_GRACE_PERIOD_MS;
      try {
        await liveSession.waitForFinal(graceMs);
      } catch {
        // Ignore grace period timeout
      }

      liveSession.close();
    }

    this.recorder = null;
    this.liveSession = null;

    const finalText = this.accumulator.getFinalizedText();
    this.setState('idle');

    const result: VoiceResult = {
      ok: true,
      transcript: finalText,
    };
    this.options.onComplete?.(result);
    return result;
  }

  /**
   * Aborts active recording immediately without waiting for final transcript.
   */
  public abort(): VoiceResult {
    this.clearMaxDurationTimer();
    this.sessionToken++;

    if (this.recorder) {
      this.recorder.abort();
      this.recorder = null;
    }
    if (this.liveSession) {
      this.liveSession.close();
      this.liveSession = null;
    }

    const partialText = this.accumulator.getFinalizedText();
    this.setState('idle');

    const result: VoiceResult = {
      ok: false,
      transcript: partialText,
      warning: 'Voice cancelled',
      category: 'cancelled',
    };
    this.options.onComplete?.(result);
    return result;
  }

  /**
   * Handles errors during preparing/recording/finalizing.
   * Crucial invariant: ALWAYS preserves accumulated transcript.
   */
  private handleFailure(err: unknown, token: number): VoiceResult {
    if (token !== this.sessionToken) {
      return {
        ok: false,
        transcript: this.accumulator.getFinalizedText(),
      };
    }

    this.clearMaxDurationTimer();

    // Log diagnostic error safely
    logError(err, { component: 'VoiceController', state: this.state });

    // Clean up processes immediately
    if (this.recorder) {
      this.recorder.abort();
      this.recorder = null;
    }
    if (this.liveSession) {
      this.liveSession.close();
      this.liveSession = null;
    }

    const classified = classifyVoiceError(err);
    const partialTranscript = this.accumulator.getFinalizedText();

    this.setState('idle');

    this.options.onWarning?.(classified.warning);

    const result: VoiceResult = {
      ok: false,
      transcript: partialTranscript,
      warning: classified.warning,
      category: classified.category,
    };

    this.options.onComplete?.(result);
    return result;
  }

  private clearMaxDurationTimer(): void {
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
  }

  /**
   * Idempotent disposal of all resources.
   */
  public dispose(): void {
    this.clearMaxDurationTimer();
    this.sessionToken++;

    if (this.recorder) {
      this.recorder.abort();
      this.recorder = null;
    }
    if (this.liveSession) {
      this.liveSession.close();
      this.liveSession = null;
    }

    this.accumulator.clear();
    this.state = 'idle';
  }
}
