/**
 * Supported LLM provider identifiers.
 */
export type ProviderName = 'gemini' | 'anthropic' | 'openai' | 'custom';

/**
 * Normalized configuration for all supported model providers
 * loaded from global system environment variables.
 */
export interface EnvConfig {
  /**
   * Google Gemini API key (from global GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY).
   */
  geminiApiKey?: string;

  /**
   * Anthropic API key (from global ANTHROPIC_API_KEY).
   */
  anthropicApiKey?: string;

  /**
   * OpenAI API key (from global OPENAI_API_KEY).
   */
  openaiApiKey?: string;

  /**
   * Custom OpenAI-compatible provider configuration.
   */
  custom: {
    apiKey?: string;
    modelName?: string;
    baseURL?: string;
  };
}

/**
 * Reads and returns provider credentials directly from global environment variables.
 */
export function getEnvConfig(): EnvConfig {
  const geminiApiKey =
    process.env['GEMINI_API_KEY']?.trim() ||
    process.env['GOOGLE_GENERATIVE_AI_API_KEY']?.trim() ||
    undefined;

  const anthropicApiKey = process.env['ANTHROPIC_API_KEY']?.trim() || undefined;

  const openaiApiKey = process.env['OPENAI_API_KEY']?.trim() || undefined;

  const customApiKey = process.env['CUSTOM_API_KEY']?.trim() || undefined;
  const customApiModelName = process.env['CUSTOM_API_MODEL_NAME']?.trim() || undefined;
  const customApiUrl = process.env['CUSTOM_API_URL']?.trim() || undefined;

  return {
    geminiApiKey,
    anthropicApiKey,
    openaiApiKey,
    custom: {
      apiKey: customApiKey,
      modelName: customApiModelName,
      baseURL: customApiUrl,
    },
  };
}

/**
 * Checks if the necessary credentials/configuration exist for a given provider.
 */
export function hasProviderConfig(provider: ProviderName, config = getEnvConfig()): boolean {
  switch (provider) {
    case 'gemini':
      return Boolean(config.geminiApiKey);
    case 'anthropic':
      return Boolean(config.anthropicApiKey);
    case 'openai':
      return Boolean(config.openaiApiKey);
    case 'custom':
      // Custom provider requires at least a baseURL and model name; apiKey may be optional (e.g. local Ollama/vLLM)
      return Boolean(config.custom.baseURL && config.custom.modelName);
  }
}

/**
 * Returns a list of all providers that have valid credentials configured in the environment.
 */
export function getAvailableProviders(config = getEnvConfig()): ProviderName[] {
  const providers: ProviderName[] = [];

  if (hasProviderConfig('gemini', config)) providers.push('gemini');
  if (hasProviderConfig('anthropic', config)) providers.push('anthropic');
  if (hasProviderConfig('openai', config)) providers.push('openai');
  if (hasProviderConfig('custom', config)) providers.push('custom');

  return providers;
}
