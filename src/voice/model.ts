import type { VoiceModelDescriptor } from './types.js';

export const VOICE_MODEL_ID = 'gemini-3.5-transcribe-live';

/**
 * Returns the fixed descriptor for the Gemini Live Transcription model.
 * This model descriptor is strictly decoupled from the standard chat model catalog.
 */
export function getVoiceModel(): VoiceModelDescriptor {
  return {
    provider: 'gemini',
    modelId: VOICE_MODEL_ID,
    mode: 'live-transcription',
    responseModality: 'text',
  };
}
