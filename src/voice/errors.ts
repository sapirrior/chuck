import type { VoiceErrorCategory } from './types.js';

export interface ClassifiedVoiceError {
  category: VoiceErrorCategory;
  warning: string;
  originalMessage?: string;
}

/**
 * Classifies an error caught in the voice subsystem into a standardized category
 * and concise single-line warning string.
 */
export function classifyVoiceError(err: unknown): ClassifiedVoiceError {
  if (!err) {
    return {
      category: 'unknown',
      warning: 'Voice stopped: transcription error',
    };
  }

  const rawMessage =
    err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
  const lower = rawMessage.toLowerCase();

  // 1. Prerequisites / Config
  if (
    lower.includes('not configured') ||
    lower.includes('key missing') ||
    lower.includes('no gemini')
  ) {
    return {
      category: 'not-configured',
      warning: 'Voice unavailable: configure GEMINI_API_KEY',
      originalMessage: rawMessage,
    };
  }

  // 2. parec executable missing
  if (
    lower.includes('parec is not installed') ||
    lower.includes('parec not found') ||
    lower.includes('arecord is not installed') ||
    lower.includes('arecord not found') ||
    (lower.includes('enoent') && (lower.includes('parec') || lower.includes('arecord')))
  ) {
    return {
      category: 'arecord-missing',
      warning: 'Voice unavailable: parec is not installed (install pulseaudio-utils)',
      originalMessage: rawMessage,
    };
  }

  // 3. parec runtime failure
  if (
    lower.includes('parec') ||
    lower.includes('arecord') ||
    lower.includes('recording failed') ||
    lower.includes('microphone') ||
    lower.includes('pulseaudio') ||
    lower.includes('connection refused') ||
    lower.includes('connection failure')
  ) {
    return {
      category: 'arecord-failed',
      warning: 'Voice stopped: microphone recording failed',
      originalMessage: rawMessage,
    };
  }

  // 4. Authentication / 401 / 403
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('api_key_invalid') ||
    lower.includes('invalid api key') ||
    lower.includes('authentication')
  ) {
    return {
      category: 'auth',
      warning: 'Voice unavailable: invalid GEMINI_API_KEY',
      originalMessage: rawMessage,
    };
  }

  // 5. Rate limit / 429
  if (
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('resource_exhausted') ||
    lower.includes('too many requests')
  ) {
    return {
      category: 'rate-limit',
      warning: 'Voice stopped: Gemini rate limit reached',
      originalMessage: rawMessage,
    };
  }

  // 6. Model unavailable / unsupported
  if (
    lower.includes('model not found') ||
    lower.includes('not supported') ||
    lower.includes('model unavailable') ||
    lower.includes('unsupported model')
  ) {
    return {
      category: 'model-unavailable',
      warning: 'Voice unavailable: live transcription model unavailable',
      originalMessage: rawMessage,
    };
  }

  // 7. Timeout
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('deadline')) {
    return {
      category: 'timeout',
      warning: 'Voice stopped: transcription timed out',
      originalMessage: rawMessage,
    };
  }

  // 8. Service unavailable / 503 / 500
  if (
    lower.includes('503') ||
    lower.includes('502') ||
    lower.includes('service unavailable') ||
    lower.includes('bad gateway')
  ) {
    return {
      category: 'service-unavailable',
      warning: 'Voice unavailable: Gemini service unavailable',
      originalMessage: rawMessage,
    };
  }

  // 9. Network / Connection errors
  if (
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('enotfound') ||
    lower.includes('network') ||
    lower.includes('connection lost') ||
    lower.includes('socket closed') ||
    lower.includes('fetch failed') ||
    lower.includes('aborted')
  ) {
    return {
      category: 'network',
      warning: 'Voice stopped: network connection lost',
      originalMessage: rawMessage,
    };
  }

  // 10. Fallback
  return {
    category: 'unknown',
    warning: 'Voice stopped: transcription error',
    originalMessage: rawMessage,
  };
}
