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
// Exclude non-text/specialized models: omni, antigravity, robotics, embedding, audio, tts, transcribe, live, computer, image
const GOOGLE_MODEL_EXCLUDE_REGEX =
  /(omni|antigravity|robotics|embedding|audio|tts|transcribe|live|computer|image)/i;

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
    .filter(
      (item) =>
        typeof item.id === 'string' &&
        OPENAI_MODEL_REGEX.test(item.id) &&
        !/(audio|tts|transcribe)/i.test(item.id),
    )
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

// --- xAI ---------------------------------------------------------------
// xAI's /v1/models list mixes chat/text models with image, video, speech,
// and transcription model IDs (no type/modality field to filter on),
// so filter by ID pattern: keep grok-* chat/reasoning models, exclude known non-text families.
const XAI_MODEL_INCLUDE_REGEX = /^grok-/i;
const XAI_MODEL_EXCLUDE_REGEX = /(imagine-image|imagine-video|-voice-|^grok-imagine)/i;

export async function fetchXaiModels(
  apiKey: string,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<ModelDescriptor[]> {
  const response = await fetch('https://api.x.ai/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`xAI API request failed: HTTP ${response.status} (${response.statusText})`);
  }

  const payload = (await response.json()) as { data?: Array<{ id: string }> };
  if (!Array.isArray(payload.data)) return [];

  return payload.data
    .filter(
      (item) =>
        typeof item.id === 'string' &&
        XAI_MODEL_INCLUDE_REGEX.test(item.id) &&
        !XAI_MODEL_EXCLUDE_REGEX.test(item.id),
    )
    .map((item) => ({ provider: 'xai' as const, model_id: item.id }))
    .sort((a, b) => a.model_id.localeCompare(b.model_id));
}

// --- Mistral -------------------------------------------------------------
// Mistral's /v1/models response is self-describing (capabilities.completion_chat),
// so no regex is needed — filter on the capability flag directly and drop
// archived / fine-tuned entries so the picker only shows base chat models.
interface MistralModelCard {
  id: string;
  capabilities?: { completion_chat?: boolean };
  archived?: boolean;
  TYPE?: string;
}

export async function fetchMistralModels(
  apiKey: string,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<ModelDescriptor[]> {
  const response = await fetch('https://api.mistral.ai/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Mistral API request failed: HTTP ${response.status} (${response.statusText})`);
  }

  const payload = (await response.json()) as { data?: MistralModelCard[] };
  if (!Array.isArray(payload.data)) return [];

  return payload.data
    .filter(
      (item) =>
        typeof item.id === 'string' &&
        item.capabilities?.completion_chat === true &&
        item.archived !== true &&
        item.TYPE !== 'fine-tuned',
    )
    .map((item) => ({ provider: 'mistral' as const, model_id: item.id }))
    .sort((a, b) => a.model_id.localeCompare(b.model_id));
}

// --- DeepSeek --------------------------------------------------------------
// DeepSeek's list endpoint today only returns chat-capable text models.
// Guard against unexpected future additions with a light deny-list.
const DEEPSEEK_MODEL_EXCLUDE_REGEX = /(embed|rerank|moderation)/i;

export async function fetchDeepSeekModels(
  apiKey: string,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<ModelDescriptor[]> {
  const response = await fetch('https://api.deepseek.com/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `DeepSeek API request failed: HTTP ${response.status} (${response.statusText})`,
    );
  }

  const payload = (await response.json()) as { data?: Array<{ id: string }> };
  if (!Array.isArray(payload.data)) return [];

  return payload.data
    .filter((item) => typeof item.id === 'string' && !DEEPSEEK_MODEL_EXCLUDE_REGEX.test(item.id))
    .map((item) => ({ provider: 'deepseek' as const, model_id: item.id }))
    .sort((a, b) => a.model_id.localeCompare(b.model_id));
}

// --- OpenRouter --------------------------------------------------------------
// OpenRouter's catalog is large (paginated) and mixes every modality.
// Filter on architecture.output_modalities including "text".
// IDs are namespaced (e.g. "openai/gpt-4") and preserved as-is.
interface OpenRouterModelEntry {
  id: string;
  architecture?: { output_modalities?: string[] };
}
interface OpenRouterModelsPage {
  data?: OpenRouterModelEntry[];
  links?: { next?: string | null };
}

export async function fetchOpenRouterModels(
  apiKey: string,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<ModelDescriptor[]> {
  const results: ModelDescriptor[] = [];
  let url: string | null = 'https://openrouter.ai/api/v1/models';

  while (url) {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(
        `OpenRouter API request failed: HTTP ${response.status} (${response.statusText})`,
      );
    }

    const payload = (await response.json()) as OpenRouterModelsPage;
    if (Array.isArray(payload.data)) {
      for (const item of payload.data) {
        if (
          typeof item.id === 'string' &&
          (item.architecture?.output_modalities?.includes('text') ?? true)
        ) {
          results.push({ provider: 'openrouter', model_id: item.id });
        }
      }
    }

    const next = payload.links?.next ?? null;
    url = next ? new URL(next, 'https://openrouter.ai').toString() : null;
  }

  return results.sort((a, b) => a.model_id.localeCompare(b.model_id));
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
      xai: { status: 'unconfigured', modelCount: 0 },
      mistral: { status: 'unconfigured', modelCount: 0 },
      deepseek: { status: 'unconfigured', modelCount: 0 },
      openrouter: { status: 'unconfigured', modelCount: 0 },
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

  // 4. xAI
  if (config.xaiApiKey) {
    tasks.push(
      fetchXaiModels(config.xaiApiKey, timeoutMs)
        .then((models) => {
          result.models.push(...models);
          result.providers.xai = {
            status: 'available',
            modelCount: models.length,
          };
        })
        .catch((err) => {
          result.providers.xai = {
            status: 'error',
            modelCount: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }),
    );
  }

  // 5. Mistral
  if (config.mistralApiKey) {
    tasks.push(
      fetchMistralModels(config.mistralApiKey, timeoutMs)
        .then((models) => {
          result.models.push(...models);
          result.providers.mistral = {
            status: 'available',
            modelCount: models.length,
          };
        })
        .catch((err) => {
          result.providers.mistral = {
            status: 'error',
            modelCount: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }),
    );
  }

  // 6. DeepSeek
  if (config.deepseekApiKey) {
    tasks.push(
      fetchDeepSeekModels(config.deepseekApiKey, timeoutMs)
        .then((models) => {
          result.models.push(...models);
          result.providers.deepseek = {
            status: 'available',
            modelCount: models.length,
          };
        })
        .catch((err) => {
          result.providers.deepseek = {
            status: 'error',
            modelCount: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }),
    );
  }

  // 7. OpenRouter
  if (config.openrouterApiKey) {
    tasks.push(
      fetchOpenRouterModels(config.openrouterApiKey, timeoutMs)
        .then((models) => {
          result.models.push(...models);
          result.providers.openrouter = {
            status: 'available',
            modelCount: models.length,
          };
        })
        .catch((err) => {
          result.providers.openrouter = {
            status: 'error',
            modelCount: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }),
    );
  }

  // 8. Custom OpenAI-compatible model
  // If all custom variables are added (CUSTOM_API_KEY, CUSTOM_API_MODEL_NAME, CUSTOM_API_URL),
  // the model is listed using the configured model name
  if (config.custom.apiKey && config.custom.modelName && config.custom.baseURL) {
    result.models.push({
      provider: 'custom',
      model_id: config.custom.modelName,
    });
    result.providers.custom = {
      status: 'available',
      modelCount: 1,
    };
  }

  await Promise.all(tasks);

  return result;
}
