export type VoiceState = 'idle' | 'preparing' | 'recording' | 'finalizing';

export type VoiceErrorCategory =
  | 'not-configured'
  | 'arecord-missing'
  | 'arecord-failed'
  | 'auth'
  | 'rate-limit'
  | 'network'
  | 'service-unavailable'
  | 'model-unavailable'
  | 'timeout'
  | 'cancelled'
  | 'unknown';

export interface VoiceModelDescriptor {
  readonly provider: 'gemini';
  readonly modelId: string;
  readonly mode: 'live-transcription';
  readonly responseModality: 'text';
}

export interface TranscriptEvent {
  text: string;
  isFinal: boolean;
}

export interface VoiceResult {
  ok: boolean;
  transcript: string;
  warning?: string;
  category?: VoiceErrorCategory;
}

export interface AudioRecorderEvents {
  onChunk: (chunk: Uint8Array) => void;
  onError: (error: Error) => void;
  onExit: (code: number | null, signal: string | null) => void;
}

export interface AudioRecorder {
  isAvailable(): Promise<boolean>;
  start(events: AudioRecorderEvents): Promise<void>;
  stop(): Promise<void>;
  abort(): void;
  readonly isRecording: boolean;
}

export interface LiveTranscriptionSessionEvents {
  onTranscript: (event: TranscriptEvent) => void;
  onError: (error: Error) => void;
  onClose: (code: number, reason: string) => void;
}

export interface LiveTranscriptionSession {
  connect(events: LiveTranscriptionSessionEvents): Promise<void>;
  sendAudio(chunk: Uint8Array): void;
  endActivity(): void;
  waitForFinal(timeoutMs?: number): Promise<string>;
  close(): void;
  readonly isConnected: boolean;
}
