import { VOICE_MODEL_ID } from './model.js';
import { getVoiceLanguage } from '../config/settings.js';
import type {
  LiveTranscriptionSession,
  LiveTranscriptionSessionEvents,
  TranscriptEvent,
} from './types.js';

export type WebSocketFactory = (url: string) => WebSocket;

export interface GeminiLiveSessionOptions {
  apiKey: string;
  wsFactory?: WebSocketFactory;
  apiHost?: string;
  apiVersion?: string;
  language?: string;
}

export class GeminiLiveTranscriptionSession implements LiveTranscriptionSession {
  private apiKey: string;
  private wsFactory: WebSocketFactory;
  private apiHost: string;
  private apiVersion: string;
  private language?: string;
  private ws: WebSocket | null = null;
  private connected = false;
  private closed = false;
  private events: LiveTranscriptionSessionEvents | null = null;
  private finalResolvers: Array<() => void> = [];
  private connectionTimeout: NodeJS.Timeout | null = null;

  constructor(options: GeminiLiveSessionOptions) {
    this.apiKey = options.apiKey;
    this.wsFactory = options.wsFactory ?? ((url) => new WebSocket(url));
    this.apiHost = options.apiHost ?? 'generativelanguage.googleapis.com';
    this.apiVersion = options.apiVersion ?? 'v1beta';
    this.language = options.language ?? getVoiceLanguage();
  }

  public get isConnected(): boolean {
    return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public async connect(events: LiveTranscriptionSessionEvents): Promise<void> {
    if (this.ws) {
      throw new Error('Live transcription session already connected or connecting.');
    }

    this.events = events;
    this.closed = false;

    const endpoint = `wss://${this.apiHost}/ws/google.ai.generativelanguage.${this.apiVersion}.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(this.apiKey)}`;

    return new Promise<void>((resolve, reject) => {
      let isSetupResolved = false;

      const clearTimer = () => {
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
      };

      try {
        const ws = this.wsFactory(endpoint);
        this.ws = ws;

        this.connectionTimeout = setTimeout(() => {
          if (!isSetupResolved) {
            isSetupResolved = true;
            clearTimer();
            this.close();
            reject(new Error('Timed out waiting for Gemini Live setup confirmation.'));
          }
        }, 10000);

        ws.onopen = () => {
          // Send setup message immediately on open
          const setupMsg = {
            setup: {
              model: `models/${VOICE_MODEL_ID}`,
              generationConfig: {
                responseModalities: ['TEXT'],
              },
              inputAudioTranscription: {
                languageCodes: this.language ? [this.language] : [],
                mode: 'SMART',
              },
            },
          };
          try {
            ws.send(JSON.stringify(setupMsg));
          } catch (err: any) {
            if (!isSetupResolved) {
              isSetupResolved = true;
              clearTimer();
              reject(err);
            }
          }
        };

        ws.onmessage = (event) => {
          try {
            let rawData = '';
            if (typeof event.data === 'string') {
              rawData = event.data;
            } else if (event.data instanceof ArrayBuffer || ArrayBuffer.isView(event.data)) {
              rawData = new TextDecoder().decode(event.data);
            } else if (event.data) {
              rawData = Buffer.from(event.data).toString('utf-8');
            }
            if (!rawData) return;
            const payload = JSON.parse(rawData);

            // 1. Setup complete handshake
            if (payload.setupComplete !== undefined) {
              if (!isSetupResolved) {
                isSetupResolved = true;
                clearTimer();
                this.connected = true;
                resolve();
              }
              return;
            }

            // 2. Server Content updates
            if (payload.serverContent) {
              this.handleServerContent(payload.serverContent);
            }
          } catch {
            // Ignore malformed JSON or handle silently
          }
        };

        ws.onerror = (evt: any) => {
          const errMsg = evt?.message || 'WebSocket error connecting to Gemini Live API';
          const error = new Error(errMsg);
          if (!isSetupResolved) {
            isSetupResolved = true;
            clearTimer();
            reject(error);
          } else if (!this.closed && this.events) {
            this.events.onError(error);
          }
        };

        ws.onclose = (evt) => {
          this.connected = false;
          if (!isSetupResolved) {
            isSetupResolved = true;
            clearTimer();
            reject(
              new Error(
                `WebSocket closed before setup (code ${evt.code}: ${evt.reason || 'closed'})`,
              ),
            );
          } else if (!this.closed && this.events) {
            this.events.onClose(evt.code, evt.reason || '');
          }
          this.notifyFinalResolvers();
        };
      } catch (err: any) {
        if (!isSetupResolved) {
          isSetupResolved = true;
          clearTimer();
          reject(err);
        }
      }
    });
  }

  private handleServerContent(serverContent: any): void {
    if (!this.events) return;

    // 1. inputAudioTranscription or inputTranscription / interimInputTranscription
    if (serverContent.inputTranscription) {
      const { text, isFinal } = serverContent.inputTranscription;
      if (text) {
        this.events.onTranscript({
          text,
          isFinal: isFinal !== undefined ? Boolean(isFinal) : true,
        });
        if (isFinal !== false) {
          this.notifyFinalResolvers();
        }
      }
    } else if (serverContent.interimInputTranscription) {
      const { text } = serverContent.interimInputTranscription;
      if (text) {
        this.events.onTranscript({
          text,
          isFinal: false,
        });
      }
    }

    // 2. modelTurn parts (for models streaming text directly)
    if (serverContent.modelTurn?.parts) {
      for (const part of serverContent.modelTurn.parts) {
        if (typeof part.text === 'string' && part.text) {
          const isFinal = Boolean(serverContent.turnComplete);
          this.events.onTranscript({
            text: part.text,
            isFinal,
          });
        }
      }
    }

    if (serverContent.turnComplete) {
      this.notifyFinalResolvers();
    }
  }

  public sendAudio(chunk: Uint8Array): void {
    if (!this.isConnected || !this.ws) return;

    const base64Data = Buffer.from(chunk).toString('base64');
    const msg = {
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: base64Data,
        },
      },
    };

    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      // Ignore send errors on dying socket
    }
  }

  public endActivity(): void {
    if (!this.isConnected || !this.ws) return;

    const endMsg = {
      realtimeInput: {
        audioStreamEnd: true,
      },
    };

    try {
      this.ws.send(JSON.stringify(endMsg));
    } catch {
      // Ignore
    }
  }

  public async waitForFinal(timeoutMs = 4000): Promise<string> {
    return new Promise<string>((resolve) => {
      let timer: NodeJS.Timeout | null = null;

      const finish = () => {
        if (timer) clearTimeout(timer);
        resolve('');
      };

      timer = setTimeout(() => {
        const idx = this.finalResolvers.indexOf(finish);
        if (idx !== -1) this.finalResolvers.splice(idx, 1);
        finish();
      }, timeoutMs);

      this.finalResolvers.push(finish);
    });
  }

  private notifyFinalResolvers(): void {
    const resolvers = [...this.finalResolvers];
    this.finalResolvers = [];
    for (const res of resolvers) {
      res();
    }
  }

  public close(): void {
    this.closed = true;
    this.connected = false;
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    this.notifyFinalResolvers();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close error
      }
      this.ws = null;
    }
  }
}
