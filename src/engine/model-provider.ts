import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
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
  custom: 'default',
};

/**
 * Priority hierarchy for selecting a default provider when multiple are configured.
 * Level 1: Gemini
 * Level 2: Anthropic
 * Level 3: OpenAI
 * Level 4: Custom OpenAI-compatible
 */
export const PROVIDER_SELECTION_PRIORITY: readonly ProviderName[] = [
  'gemini',
  'anthropic',
  'openai',
  'custom',
] as const;

/**
 * Resolves the active model selection based on explicit user choices,
 * saved user preferences (~/.xd/settings.json), and configured environment credentials.
 */
export function resolveActiveModelSelection(
  requested?: Partial<ModelSelection>,
  config: EnvConfig = getEnvConfig(),
): ModelSelection {
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
    };
  }

  // 3. Explicit modelId with inferred provider
  if (requested?.modelId) {
    const inferredProvider = inferProviderFromModelId(requested.modelId);
    if (inferredProvider && hasProviderConfig(inferredProvider, config)) {
      return {
        provider: inferredProvider,
        modelId: requested.modelId,
      };
    }
  }

  // 4. Saved user preference in ~/.xd/settings.json
  const savedModel = getSavedModel();
  if (savedModel && hasProviderConfig(savedModel.provider, config)) {
    return {
      provider: savedModel.provider,
      modelId: savedModel.modelId,
    };
  }

  // 5. Fallback to priority hierarchy among available configured providers
  const available = getAvailableProviders(config);
  if (available.length === 0) {
    throw new Error(
      'No model providers configured. Please export GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, or CUSTOM_API_URL / CUSTOM_API_MODEL_NAME.',
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
      };
    }
  }

  // Fallback to first available provider
  const fallbackProvider = available[0]!;
  return {
    provider: fallbackProvider,
    modelId: DEFAULT_MODELS_BY_PROVIDER[fallbackProvider],
  };
}

/**
 * Instantiates an AI SDK LanguageModelV1 instance for the given selection.
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
  return null;
}
