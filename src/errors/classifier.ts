import { APICallError, NoSuchModelError, TypeValidationError } from 'ai';
import type { StructuredError } from './types.js';

/**
 * Classifies raw exceptions from the AI SDK, providers, and tools
 * into actionable, structured error objects.
 */
export function classifyError(error: unknown): StructuredError {
  if (!error) {
    return {
      category: 'unknown',
      shortMessage: 'Unknown error occurred',
      isRetryable: false,
    };
  }

  // 1. User / Signal Abort
  if (
    (error as any)?.name === 'AbortError' ||
    (error as any)?.message?.includes('aborted') ||
    (error as any)?.message?.includes('AbortError')
  ) {
    return {
      category: 'aborted',
      code: 'ABORTED',
      shortMessage: 'Interrupted by user',
      isRetryable: false,
      originalError: error,
    };
  }

  // 2. AI SDK APICallError
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    const body = typeof error.responseBody === 'string' ? error.responseBody : '';
    const rawMsg = error.message || '';

    if (
      status === 401 ||
      body.includes('invalid_api_key') ||
      body.includes('User not found') ||
      rawMsg.includes('401')
    ) {
      return {
        category: 'auth',
        statusCode: 401,
        shortMessage: '401 User not found / Invalid API key',
        isRetryable: false,
        suggestedAction: 'Check your API key in ~/.env or select a model with /model',
        originalError: error,
      };
    }

    if (status === 403) {
      return {
        category: 'forbidden',
        statusCode: 403,
        shortMessage: '403 Forbidden - Access denied',
        isRetryable: false,
        suggestedAction: 'Verify model permissions or credit balance on your provider account',
        originalError: error,
      };
    }

    if (status === 429 || body.includes('rate_limit') || rawMsg.includes('429')) {
      return {
        category: 'rate-limit',
        statusCode: 429,
        shortMessage: '429 Rate limit reached',
        isRetryable: true,
        retryAfterSec: 5,
        suggestedAction: 'Provider quota reached. Waiting before retry or switch models via /model',
        originalError: error,
      };
    }

    if (status === 503 || status === 502 || status === 504 || status === 500) {
      return {
        category: status === 503 ? 'overload' : 'server-error',
        statusCode: status,
        shortMessage: `${status} Provider service temporarily overloaded`,
        isRetryable: true,
        retryAfterSec: 6,
        suggestedAction: 'Upstream model server is overloaded. Retrying automatically',
        originalError: error,
      };
    }

    if (
      body.includes('context_length_exceeded') ||
      body.includes('maximum context length') ||
      rawMsg.includes('context length')
    ) {
      return {
        category: 'context-length',
        shortMessage: 'Context window limit exceeded',
        isRetryable: false,
        suggestedAction: 'Run /clear to start a new session or summarize past conversation',
        originalError: error,
      };
    }

    return {
      category: 'server-error',
      statusCode: status,
      shortMessage: error.message?.slice(0, 100) || `API error (${status})`,
      isRetryable: Boolean(error.isRetryable),
      originalError: error,
    };
  }

  // 3. NoSuchModelError
  if (NoSuchModelError.isInstance(error)) {
    return {
      category: 'model-not-found',
      code: 'NO_SUCH_MODEL',
      shortMessage: `Model not found: ${error.modelId ?? 'unknown'}`,
      isRetryable: false,
      suggestedAction:
        'The requested model ID is retired or invalid. Run /model to pick an active model',
      originalError: error,
    };
  }

  // 4. TypeValidationError
  if (TypeValidationError.isInstance(error)) {
    return {
      category: 'validation',
      code: 'VALIDATION_ERROR',
      shortMessage: 'Structured output schema validation failed',
      isRetryable: true,
      suggestedAction: 'Model produced an unexpected format. Retrying may succeed',
      originalError: error,
    };
  }

  // 5. Generic Error Strings & Common Network Failures
  const msg = (error instanceof Error ? error.message : String(error)) || '';
  const lower = msg.toLowerCase();

  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('user not found')) {
    return {
      category: 'auth',
      statusCode: 401,
      shortMessage: '401 User not found / Invalid API key',
      isRetryable: false,
      suggestedAction: 'Please verify your API key in environment or run /model',
      originalError: error,
    };
  }

  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return {
      category: 'rate-limit',
      statusCode: 429,
      shortMessage: '429 Rate limit reached',
      isRetryable: true,
      retryAfterSec: 5,
      suggestedAction: 'Rate limit encountered. Retrying shortly',
      originalError: error,
    };
  }

  if (
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('timeout')
  ) {
    return {
      category: 'network',
      shortMessage: 'Network connection dropped / timed out',
      isRetryable: true,
      retryAfterSec: 4,
      suggestedAction: 'Check your internet connection and provider status',
      originalError: error,
    };
  }

  return {
    category: 'unknown',
    shortMessage: msg.length > 100 ? `${msg.slice(0, 97)}…` : msg || 'Unexpected execution error',
    isRetryable: false,
    suggestedAction: 'If issue persists, run /clear or check ~/.xd/logs',
    originalError: error,
  };
}
