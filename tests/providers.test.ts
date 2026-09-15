import { describe, expect, it } from 'bun:test';
import {
  ALL_PROVIDER_NAMES,
  getAvailableProviders,
  hasProviderConfig,
  type EnvConfig,
} from '../src/config/index.js';
import {
  DEFAULT_MODELS_BY_PROVIDER,
  PROVIDER_SELECTION_PRIORITY,
  resolveActiveModelSelection,
} from '../src/engine/model-provider.js';
import {
  fetchDeepSeekModels,
  fetchMistralModels,
  fetchOpenRouterModels,
  fetchXaiModels,
} from '../src/models/discovery.js';

describe('Provider Configuration & Discovery', () => {
  it('should include all 8 providers in ALL_PROVIDER_NAMES and priority list', () => {
    expect(ALL_PROVIDER_NAMES).toEqual([
      'gemini',
      'anthropic',
      'openai',
      'xai',
      'mistral',
      'deepseek',
      'openrouter',
      'custom',
    ]);
    expect(PROVIDER_SELECTION_PRIORITY).toEqual(ALL_PROVIDER_NAMES);
  });

  it('should accurately detect configured providers via hasProviderConfig and getAvailableProviders', () => {
    const emptyConfig: EnvConfig = { custom: {} };
    expect(getAvailableProviders(emptyConfig)).toEqual([]);

    const xaiConfig: EnvConfig = { xaiApiKey: 'xai-test-key', custom: {} };
    expect(hasProviderConfig('xai', xaiConfig)).toBe(true);
    expect(hasProviderConfig('mistral', xaiConfig)).toBe(false);
    expect(getAvailableProviders(xaiConfig)).toEqual(['xai']);

    const fullConfig: EnvConfig = {
      geminiApiKey: 'g-key',
      anthropicApiKey: 'a-key',
      openaiApiKey: 'o-key',
      xaiApiKey: 'x-key',
      mistralApiKey: 'm-key',
      deepseekApiKey: 'd-key',
      openrouterApiKey: 'or-key',
      custom: {
        baseURL: 'http://localhost:11434/v1',
        modelName: 'qwen2.5-coder',
        apiKey: 'ollama',
      },
    };

    expect(getAvailableProviders(fullConfig)).toEqual([
      'gemini',
      'anthropic',
      'openai',
      'xai',
      'mistral',
      'deepseek',
      'openrouter',
      'custom',
    ]);
  });

  it('should correctly infer provider from model ID including OpenRouter namespaced IDs', () => {
    const config: EnvConfig = {
      geminiApiKey: 'g',
      anthropicApiKey: 'a',
      openaiApiKey: 'o',
      xaiApiKey: 'x',
      mistralApiKey: 'm',
      deepseekApiKey: 'd',
      openrouterApiKey: 'or',
      custom: {},
    };

    // OpenRouter namespaced prefix priority check
    expect(resolveActiveModelSelection({ modelId: 'openai/gpt-4o-mini' }, config)).toEqual({
      provider: 'openrouter',
      modelId: 'openai/gpt-4o-mini',
    });
    expect(resolveActiveModelSelection({ modelId: 'anthropic/claude-3-7-sonnet' }, config)).toEqual({
      provider: 'openrouter',
      modelId: 'anthropic/claude-3-7-sonnet',
    });

    // xAI
    expect(resolveActiveModelSelection({ modelId: 'grok-4-fast-non-reasoning' }, config)).toEqual({
      provider: 'xai',
      modelId: 'grok-4-fast-non-reasoning',
    });

    // DeepSeek
    expect(resolveActiveModelSelection({ modelId: 'deepseek-flash' }, config)).toEqual({
      provider: 'deepseek',
      modelId: 'deepseek-flash',
    });

    // Mistral
    expect(resolveActiveModelSelection({ modelId: 'mistral-small-latest' }, config)).toEqual({
      provider: 'mistral',
      modelId: 'mistral-small-latest',
    });
    expect(resolveActiveModelSelection({ modelId: 'magistral-small-2507' }, config)).toEqual({
      provider: 'mistral',
      modelId: 'magistral-small-2507',
    });
    expect(resolveActiveModelSelection({ modelId: 'pixtral-12b-2409' }, config)).toEqual({
      provider: 'mistral',
      modelId: 'pixtral-12b-2409',
    });
  });

  it('should have sensible defaults in DEFAULT_MODELS_BY_PROVIDER', () => {
    expect(DEFAULT_MODELS_BY_PROVIDER.xai).toBe('grok-4-fast-non-reasoning');
    expect(DEFAULT_MODELS_BY_PROVIDER.mistral).toBe('mistral-small-latest');
    expect(DEFAULT_MODELS_BY_PROVIDER.deepseek).toBe('deepseek-flash');
    expect(DEFAULT_MODELS_BY_PROVIDER.openrouter).toBe('openrouter/free');
  });
});

describe('Provider Model Discovery Filtering', () => {
  const originalFetch = globalThis.fetch;

  it('should filter xAI models correctly (exclude imagine / video / voice)', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'grok-4-fast-non-reasoning' },
            { id: 'grok-imagine-image' },
            { id: 'grok-imagine-video' },
            { id: 'grok-voice-1' },
            { id: 'grok-3-mini' },
          ],
        }),
        { status: 200 },
      );

    const models = await fetchXaiModels('test-key');
    expect(models).toEqual([
      { provider: 'xai', model_id: 'grok-3-mini' },
      { provider: 'xai', model_id: 'grok-4-fast-non-reasoning' },
    ]);
  });

  it('should filter Mistral models by capabilities.completion_chat', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'mistral-small-latest', capabilities: { completion_chat: true }, archived: false },
            { id: 'mistral-embed', capabilities: { completion_chat: false }, archived: false },
            { id: 'old-chat', capabilities: { completion_chat: true }, archived: true },
            { id: 'ft-chat', capabilities: { completion_chat: true }, TYPE: 'fine-tuned' },
            { id: 'codestral-latest', capabilities: { completion_chat: true }, archived: false },
          ],
        }),
        { status: 200 },
      );

    const models = await fetchMistralModels('test-key');
    expect(models).toEqual([
      { provider: 'mistral', model_id: 'codestral-latest' },
      { provider: 'mistral', model_id: 'mistral-small-latest' },
    ]);
  });

  it('should filter DeepSeek models (exclude embed / rerank / moderation)', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'deepseek-flash' },
            { id: 'deepseek-v4-pro' },
            { id: 'deepseek-embed-1' },
            { id: 'deepseek-rerank' },
          ],
        }),
        { status: 200 },
      );

    const models = await fetchDeepSeekModels('test-key');
    expect(models).toEqual([
      { provider: 'deepseek', model_id: 'deepseek-flash' },
      { provider: 'deepseek', model_id: 'deepseek-v4-pro' },
    ]);
  });

  it('should paginate and filter OpenRouter models for text output modality', async () => {
    let callCount = 0;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      callCount++;
      const url = String(input);
      if (url === 'https://openrouter.ai/api/v1/models') {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'openai/gpt-4o-mini',
                architecture: { output_modalities: ['text'] },
              },
              {
                id: 'black-forest-labs/flux-1',
                architecture: { output_modalities: ['image'] },
              },
            ],
            links: { next: '/api/v1/models?offset=2' },
          }),
          { status: 200 },
        );
      } else {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'anthropic/claude-3-7-sonnet',
                architecture: { output_modalities: ['text'] },
              },
            ],
            links: { next: null },
          }),
          { status: 200 },
        );
      }
    };

    const models = await fetchOpenRouterModels('test-key');
    expect(callCount).toBe(2);
    expect(models).toEqual([
      { provider: 'openrouter', model_id: 'anthropic/claude-3-7-sonnet' },
      { provider: 'openrouter', model_id: 'openai/gpt-4o-mini' },
    ]);

    // Restore fetch
    globalThis.fetch = originalFetch;
  });
});
