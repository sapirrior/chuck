import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogle } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import { wrapLanguageModel, extractReasoningMiddleware, type LanguageModel } from 'ai';
import {
  getAvailableProviders,
  getEnvConfig,
  getSavedModel,
  hasProviderConfig,
  type EnvConfig,
  type ProviderName,
} from '../config/index.js';
import type { ModelSelection, ReasoningEffort } from './types.js';

export interface ProviderDescriptor {
  readonly name: ProviderName;
  readonly envVar: string;
  readonly apiKey: (cfg: EnvConfig) => string | undefined;
  readonly defaultModel: string;
  readonly create: (apiKey: string, cfg: EnvConfig) => (modelId: string) => LanguageModel;
  readonly isTaggedReasoning?: (modelId: string) => boolean;
}

export const PROVIDER_REGISTRY: Record<ProviderName, ProviderDescriptor> = {
  gemini: {
    name: 'gemini',
    envVar: 'GEMINI_API_KEY',
    apiKey: (c) => c.geminiApiKey,
    defaultModel: 'gemini-2.5-flash',
    create: (apiKey) => createGoogle({ apiKey }),
  },
  anthropic: {
    name: 'anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    apiKey: (c) => c.anthropicApiKey,
    defaultModel: 'claude-3-7-sonnet-20250219',
    create: (apiKey) => createAnthropic({ apiKey }),
  },
  openai: {
    name: 'openai',
    envVar: 'OPENAI_API_KEY',
    apiKey: (c) => c.openaiApiKey,
    defaultModel: 'gpt-4o-mini',
    create: (apiKey) => createOpenAI({ apiKey }),
  },
  xai: {
    name: 'xai',
    envVar: 'XAI_API_KEY',
    apiKey: (c) => c.xaiApiKey,
    defaultModel: 'grok-4-fast-non-reasoning',
    create: (apiKey) => createXai({ apiKey }),
  },
  mistral: {
    name: 'mistral',
    envVar: 'MISTRAL_API_KEY',
    apiKey: (c) => c.mistralApiKey,
    defaultModel: 'mistral-small-latest',
    create: (apiKey) => createMistral({ apiKey }),
  },
  deepseek: {
    name: 'deepseek',
    envVar: 'DEEPSEEK_API_KEY',
    apiKey: (c) => c.deepseekApiKey,
    defaultModel: 'deepseek-flash',
    create: (apiKey) => createDeepSeek({ apiKey }),
    isTaggedReasoning: () => true,
  },
  openrouter: {
    name: 'openrouter',
    envVar: 'OPENROUTER_API_KEY',
    apiKey: (c) => c.openrouterApiKey,
    defaultModel: 'openrouter/free',
    create: (apiKey) =>
      createOpenAICompatible({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey,
        headers: {
          'HTTP-Referer': 'https://github.com/sapirrior/steward',
          'X-Title': 'steward',
        },
      }),
    isTaggedReasoning: (modelId) => isTaggedReasoningModel(modelId),
  },
  custom: {
    name: 'custom',
    envVar: 'CUSTOM_API_URL / CUSTOM_API_KEY',
    apiKey: (c) => c.custom.baseURL,
    defaultModel: 'default',
    create: (_key, cfg) =>
      createOpenAICompatible({
        name: 'custom',
        baseURL: cfg.custom.baseURL!,
        apiKey: cfg.custom.apiKey,
      }),
    isTaggedReasoning: (modelId) => isTaggedReasoningModel(modelId),
  },
};

/**
 * Hardcoded default models per provider.
 */
export const DEFAULT_MODELS_BY_PROVIDER: Record<ProviderName, string> = {
  gemini: PROVIDER_REGISTRY.gemini.defaultModel,
  anthropic: PROVIDER_REGISTRY.anthropic.defaultModel,
  openai: PROVIDER_REGISTRY.openai.defaultModel,
  xai: PROVIDER_REGISTRY.xai.defaultModel,
  mistral: PROVIDER_REGISTRY.mistral.defaultModel,
  deepseek: PROVIDER_REGISTRY.deepseek.defaultModel,
  openrouter: PROVIDER_REGISTRY.openrouter.defaultModel,
  custom: PROVIDER_REGISTRY.custom.defaultModel,
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
 * Instantiates an AI SDK LanguageModel instance for the given selection using the declarative provider registry
 * and applies the universal middleware pipeline.
 */
export function createModelInstance(
  selection: ModelSelection,
  config: EnvConfig = getEnvConfig(),
): LanguageModel {
  const descriptor = PROVIDER_REGISTRY[selection.provider];
  if (!descriptor) {
    throw new Error(`Unsupported model provider: "${selection.provider}"`);
  }

  const apiKey = descriptor.apiKey(config);
  if (!apiKey) {
    throw new Error(`${descriptor.envVar} is not configured in the environment.`);
  }

  const modelId =
    selection.provider === 'custom'
      ? config.custom.modelName || selection.modelId
      : selection.modelId;

  const baseModel = descriptor.create(apiKey, config)(modelId);
  return applyModelMiddlewarePipeline(baseModel, selection, descriptor);
}

/**
 * Universal middleware pipeline: applies reasoning extraction and model-level interceptors.
 */
export function applyModelMiddlewarePipeline(
  model: LanguageModel,
  selection: ModelSelection,
  descriptor?: ProviderDescriptor,
): LanguageModel {
  let wrapped = model;

  const requiresTaggedReasoning =
    descriptor?.isTaggedReasoning?.(selection.modelId) ?? isTaggedReasoningModel(selection.modelId);

  if (requiresTaggedReasoning) {
    wrapped = wrapLanguageModel({
      model: wrapped,
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    });
  }

  return wrapped;
}

/**
 * Helper to check whether a model ID represents a model emitting inline <think> tags.
 */
function isTaggedReasoningModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.includes('deepseek') || lower.includes('r1') || lower.includes('think');
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
