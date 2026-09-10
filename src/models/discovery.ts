import { getEnvConfig, type EnvConfig, type ProviderName } from '../config/index.js';

/**
 * Normalized model descriptor schema as specified in data.txt.
 */
export interface ModelDescriptor {
  provider: ProviderName;
  model_id: string;
}

/**
 * Detailed status for each provider during discovery.
 */
export interface ProviderDiscoveryStatus {
  status: 'available' | 'unconfigured' | 'error';
  modelCount: number;
  error?: string;
}

/**
 * Result returned by the model discovery system.
 */
export interface ModelDiscoveryResult {
  models: ModelDescriptor[];
  providers: Record<ProviderName, ProviderDiscoveryStatus>;
}

// Regex patterns to filter only core textual and multimodal foundation models
const ANTHROPIC_MODEL_REGEX = /^claude-/i;
const OPENAI_MODEL_REGEX = /^(gpt-4|gpt-3\.5|o1|o3)/i;

// Google models: include only gemini- and gemma- models
const GOOGLE_MODEL_INCLUDE_REGEX = /^(gemini|gemma)-/i;
// Exclude non-text/specialized models: omni, antigravity, robotics, embedding, audio, tts, transcribe, live
const GOOGLE_MODEL_EXCLUDE_REGEX =
  /(omni|antigravity|robotics|embedding|audio|tts|transcribe|live)/i;

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetches and filters available models from OpenAI's /v1/models endpoint.
 */
export async function fetchOpenAIModels(
  apiKey: string,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<ModelDescriptor[]> {
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API request failed: HTTP ${response.status} (${response.statusText})`);
  }

  const payload = (await response.json()) as { data?: Array<{ id: string }> };
  if (!Array.isArray(payload.data)) {
    return [];
  }

  return payload.data
    .filter((item) => typeof item.id === 'string' && OPENAI_MODEL_REGEX.test(item.id))
    .map((item) => ({
      provider: 'openai' as const,
      model_id: item.id,
    }))
    .sort((a, b) => a.model_id.localeCompare(b.model_id));
}

/**
 * Fetches and filters available models from Gemini's OpenAI-compatible /models endpoint.
 */
export async function fetchGeminiModels(
  apiKey: string,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<ModelDescriptor[]> {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Gemini API request failed: HTTP ${response.status} (${response.statusText})`);
  }

  const payload = (await response.json()) as { data?: Array<{ id: string }> };
  if (!Array.isArray(payload.data)) {
    return [];
  }

  return payload.data
    .map((item) => (typeof item.id === 'string' ? item.id.replace(/^models\//, '') : ''))
    .filter(
      (id) => id && GOOGLE_MODEL_INCLUDE_REGEX.test(id) && !GOOGLE_MODEL_EXCLUDE_REGEX.test(id),
    )
    .map((id) => ({
      provider: 'gemini' as const,
      model_id: id,
    }))
    .sort((a, b) => a.model_id.localeCompare(b.model_id));
}

/**
 * Fetches and filters available models from Anthropic's /v1/models endpoint.
 */
export async function fetchAnthropicModels(
  apiKey: string,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<ModelDescriptor[]> {
  const response = await fetch('https://api.anthropic.com/v1/models', {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `Anthropic API request failed: HTTP ${response.status} (${response.statusText})`,
    );
  }

  const payload = (await response.json()) as { data?: Array<{ id: string }> };
  if (!Array.isArray(payload.data)) {
    return [];
  }

  return payload.data
    .filter((item) => typeof item.id === 'string' && ANTHROPIC_MODEL_REGEX.test(item.id))
    .map((item) => ({
      provider: 'anthropic' as const,
      model_id: item.id,
    }))
    .sort((a, b) => a.model_id.localeCompare(b.model_id));
}

/**
 * Fetches and aggregates all available models based on configured environment variables.
 * For custom models, if all custom variables are set, 'Custom' is included in the list.
 */
export async function fetchAvailableModels(
  config: EnvConfig = getEnvConfig(),
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<ModelDiscoveryResult> {
  const result: ModelDiscoveryResult = {
    models: [],
    providers: {
      gemini: { status: 'unconfigured', modelCount: 0 },
      anthropic: { status: 'unconfigured', modelCount: 0 },
      openai: { status: 'unconfigured', modelCount: 0 },
      custom: { status: 'unconfigured', modelCount: 0 },
    },
  };

  const tasks: Promise<void>[] = [];

  // 1. OpenAI
  if (config.openaiApiKey) {
    tasks.push(
      fetchOpenAIModels(config.openaiApiKey, timeoutMs)
        .then((models) => {
          result.models.push(...models);
          result.providers.openai = {
            status: 'available',
            modelCount: models.length,
          };
        })
        .catch((err) => {
          result.providers.openai = {
            status: 'error',
            modelCount: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }),
    );
  }

  // 2. Gemini
  if (config.geminiApiKey) {
    tasks.push(
      fetchGeminiModels(config.geminiApiKey, timeoutMs)
        .then((models) => {
          result.models.push(...models);
          result.providers.gemini = {
            status: 'available',
            modelCount: models.length,
          };
        })
        .catch((err) => {
          result.providers.gemini = {
            status: 'error',
            modelCount: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }),
    );
  }

  // 3. Anthropic
  if (config.anthropicApiKey) {
    tasks.push(
      fetchAnthropicModels(config.anthropicApiKey, timeoutMs)
        .then((models) => {
          result.models.push(...models);
          result.providers.anthropic = {
            status: 'available',
            modelCount: models.length,
          };
        })
        .catch((err) => {
          result.providers.anthropic = {
            status: 'error',
            modelCount: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }),
    );
  }

  // 4. Custom OpenAI-compatible model
  // If all custom variables are added (CUSTOM_API_KEY, CUSTOM_API_MODEL_NAME, CUSTOM_API_URL),
  // the model is listed as 'Custom'
  if (config.custom.apiKey && config.custom.modelName && config.custom.baseURL) {
    result.models.push({
      provider: 'custom',
      model_id: 'Custom',
    });
    result.providers.custom = {
      status: 'available',
      modelCount: 1,
    };
  }

  await Promise.all(tasks);

  return result;
}
