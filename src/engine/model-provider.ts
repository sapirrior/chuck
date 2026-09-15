import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogle } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import type { LanguageModel } from 'ai';
import {
  getAvailableProviders,
  getEnvConfig,
  getSavedModel,
  hasProviderConfig,
  type EnvConfig,
  type ProviderName,
} from '../config/index.js';
import type { ModelSelection } from './types.js';

/**
 * Hardcoded default models per provider.
 */
export const DEFAULT_MODELS_BY_PROVIDER: Record<ProviderName, string> = {
  gemini: 'gemini-2.5-flash',
  anthropic: 'claude-3-7-sonnet-20250219',
  openai: 'gpt-4o-mini',
  xai: 'grok-4-fast-non-reasoning',
  mistral: 'mistral-small-latest',
  deepseek: 'deepseek-flash',
  openrouter: 'openrouter/free',
  custom: 'default',
};

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'provider-default';

export const REASONING_EFFORT_MAP: Record<number | string, ReasoningEffort> = {
  0: 'provider-default',
  1: 'none',
  2: 'minimal',
  3: 'low',
  4: 'medium',
  5: 'high',
  6: 'xhigh',
  '0': 'provider-default',
  '1': 'none',
  '2': 'minimal',
  '3': 'low',
  '4': 'medium',
  '5': 'high',
  '6': 'xhigh',
  default: 'provider-default',
  'provider-default': 'provider-default',
  none: 'none',
  off: 'none',
  disabled: 'none',
  minimal: 'minimal',
  low: 'low',
  med: 'medium',
  medium: 'medium',
  high: 'high',
  max: 'xhigh',
  xhigh: 'xhigh',
};

/**
 * Parses user input (numeric 0-6 or string name) to canonical ReasoningEffort.
 */
export function parseReasoningEffort(input?: string | number): ReasoningEffort | undefined {
  if (input === undefined || input === null) return undefined;
  const key = typeof input === 'string' ? input.trim().toLowerCase() : input;
  return REASONING_EFFORT_MAP[key];
}

/**
 * Priority hierarchy for selecting a default provider when multiple are configured.
 * Level 1: Gemini
 * Level 2: Anthropic
 * Level 3: OpenAI
 * Level 4: xAI
 * Level 5: Mistral
 * Level 6: DeepSeek
 * Level 7: OpenRouter
 * Level 8: Custom OpenAI-compatible
 */
export const PROVIDER_SELECTION_PRIORITY: readonly ProviderName[] = [
  'gemini',
  'anthropic',
  'openai',
  'xai',
  'mistral',
  'deepseek',
  'openrouter',
  'custom',
] as const;

/**
 * Resolves the active model selection based on explicit user choices,
 * saved user preferences (~/.steward/settings.json), and configured environment credentials.
 */
export function resolveActiveModelSelection(
  requested?: Partial<ModelSelection>,
  config: EnvConfig = getEnvConfig(),
): ModelSelection {
  const savedModel = getSavedModel();
  const effort: ReasoningEffort =
    requested?.effort ?? savedModel?.effort ?? DEFAULT_REASONING_EFFORT;

  // 1. Explicit provider and modelId
  if (requested?.provider && requested?.modelId) {
    if (!hasProviderConfig(requested.provider, config)) {
      throw new Error(
        `Provider "${requested.provider}" was requested, but its credentials are not configured in the environment.`,
      );
    }
    return {
      provider: requested.provider,
      modelId: requested.modelId,
      effort,
    };
  }

  // 2. Explicit provider with default model
  if (requested?.provider) {
    if (!hasProviderConfig(requested.provider, config)) {
      throw new Error(
        `Provider "${requested.provider}" was requested, but its credentials are not configured in the environment.`,
      );
    }
    const modelId =
      requested.provider === 'custom'
        ? config.custom.modelName || DEFAULT_MODELS_BY_PROVIDER.custom
        : DEFAULT_MODELS_BY_PROVIDER[requested.provider];

    return {
      provider: requested.provider,
      modelId,
      effort,
    };
  }

  // 3. Explicit modelId with inferred provider
  if (requested?.modelId) {
    const inferredProvider = inferProviderFromModelId(requested.modelId);
    if (inferredProvider && hasProviderConfig(inferredProvider, config)) {
      return {
        provider: inferredProvider,
        modelId: requested.modelId,
        effort,
      };
    }
  }

  // 4. Saved user preference in ~/.steward/settings.json
  if (savedModel && hasProviderConfig(savedModel.provider, config)) {
    return {
      provider: savedModel.provider,
      modelId: savedModel.modelId,
      effort: requested?.effort ?? savedModel.effort ?? DEFAULT_REASONING_EFFORT,
    };
  }

  // 5. Fallback to priority hierarchy among available configured providers
  const available = getAvailableProviders(config);
  if (available.length === 0) {
    throw new Error(
      'No model providers configured. Please export GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY, MISTRAL_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY, or CUSTOM_API_URL / CUSTOM_API_MODEL_NAME.',
    );
  }

  for (const provider of PROVIDER_SELECTION_PRIORITY) {
    if (available.includes(provider)) {
      const modelId =
        provider === 'custom'
          ? config.custom.modelName || DEFAULT_MODELS_BY_PROVIDER.custom
          : DEFAULT_MODELS_BY_PROVIDER[provider];

      return {
        provider,
        modelId,
        effort,
      };
    }
  }

  // Fallback to first available provider
  const fallbackProvider = available[0]!;
  return {
    provider: fallbackProvider,
    modelId: DEFAULT_MODELS_BY_PROVIDER[fallbackProvider],
    effort,
  };
}

/**
 * Instantiates an AI SDK LanguageModel instance for the given selection.
 */
export function createModelInstance(
  selection: ModelSelection,
  config: EnvConfig = getEnvConfig(),
): LanguageModel {
  switch (selection.provider) {
    case 'gemini': {
      if (!config.geminiApiKey) {
        throw new Error('GEMINI_API_KEY is not configured in the environment.');
      }
      const google = createGoogle({
        apiKey: config.geminiApiKey,
      });
      return google(selection.modelId);
    }

    case 'openai': {
      if (!config.openaiApiKey) {
        throw new Error('OPENAI_API_KEY is not configured in the environment.');
      }
      const openai = createOpenAI({
        apiKey: config.openaiApiKey,
      });
      return openai(selection.modelId);
    }

    case 'anthropic': {
      if (!config.anthropicApiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured in the environment.');
      }
      const anthropic = createAnthropic({
        apiKey: config.anthropicApiKey,
      });
      return anthropic(selection.modelId);
    }

    case 'xai': {
      if (!config.xaiApiKey) {
        throw new Error('XAI_API_KEY is not configured in the environment.');
      }
      const xai = createXai({
        apiKey: config.xaiApiKey,
      });
      return xai(selection.modelId);
    }

    case 'mistral': {
      if (!config.mistralApiKey) {
        throw new Error('MISTRAL_API_KEY is not configured in the environment.');
      }
      const mistral = createMistral({
        apiKey: config.mistralApiKey,
      });
      return mistral(selection.modelId);
    }

    case 'deepseek': {
      if (!config.deepseekApiKey) {
        throw new Error('DEEPSEEK_API_KEY is not configured in the environment.');
      }
      const deepSeek = createDeepSeek({
        apiKey: config.deepseekApiKey,
      });
      return deepSeek(selection.modelId);
    }

    case 'openrouter': {
      if (!config.openrouterApiKey) {
        throw new Error('OPENROUTER_API_KEY is not configured in the environment.');
      }
      const openrouter = createOpenAICompatible({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: config.openrouterApiKey,
        headers: {
          'HTTP-Referer': 'https://github.com/sapirrior/steward',
          'X-Title': 'steward',
        },
      });
      return openrouter(selection.modelId);
    }

    case 'custom': {
      if (!config.custom.baseURL) {
        throw new Error('CUSTOM_API_URL is not configured in the environment.');
      }
      const custom = createOpenAICompatible({
        name: 'custom',
        baseURL: config.custom.baseURL,
        apiKey: config.custom.apiKey,
      });
      return custom(selection.modelId);
    }
  }
}

/**
 * Heuristic helper to infer provider from common model name prefixes.
 */
function inferProviderFromModelId(modelId: string): ProviderName | null {
  const lower = modelId.toLowerCase();

  // Namespaced OpenRouter IDs, e.g. "openai/gpt-4", "anthropic/claude-sonnet-5"
  if (lower.includes('/')) return 'openrouter';

  if (lower.startsWith('gemini-') || lower.startsWith('gemma-')) return 'gemini';
  if (lower.startsWith('claude-')) return 'anthropic';
  if (
    lower.startsWith('gpt-') ||
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('chatgpt-')
  ) {
    return 'openai';
  }
  if (lower.startsWith('grok-')) return 'xai';
  if (lower.startsWith('deepseek-')) return 'deepseek';
  if (
    lower.startsWith('mistral-') ||
    lower.startsWith('magistral-') ||
    lower.startsWith('pixtral-') ||
    lower.startsWith('ministral-') ||
    lower.startsWith('open-mistral-') ||
    lower.startsWith('open-mixtral-')
  ) {
    return 'mistral';
  }
  return null;
}
