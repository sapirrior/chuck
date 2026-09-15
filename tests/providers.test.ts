import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

const testDir = join(tmpdir(), 'chuck-test-' + Date.now());
mkdirSync(testDir, { recursive: true });
process.env.CHUCK_SETTINGS_DIR = join(testDir, 'settings');
process.env.CHUCK_SESSIONS_DIR = join(testDir, 'sessions');
process.env.CHUCK_LOGS_DIR = join(testDir, 'logs');

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
      effort: 'provider-default',
    });
    expect(resolveActiveModelSelection({ modelId: 'anthropic/claude-3-7-sonnet' }, config)).toEqual(
      {
        provider: 'openrouter',
        modelId: 'anthropic/claude-3-7-sonnet',
        effort: 'provider-default',
      },
    );

    // xAI
    expect(resolveActiveModelSelection({ modelId: 'grok-4-fast-non-reasoning' }, config)).toEqual({
      provider: 'xai',
      modelId: 'grok-4-fast-non-reasoning',
      effort: 'provider-default',
    });

    // DeepSeek
    expect(resolveActiveModelSelection({ modelId: 'deepseek-flash' }, config)).toEqual({
      provider: 'deepseek',
      modelId: 'deepseek-flash',
      effort: 'provider-default',
    });

    // Mistral
    expect(resolveActiveModelSelection({ modelId: 'mistral-small-latest' }, config)).toEqual({
      provider: 'mistral',
      modelId: 'mistral-small-latest',
      effort: 'provider-default',
    });
    expect(resolveActiveModelSelection({ modelId: 'magistral-small-2507' }, config)).toEqual({
      provider: 'mistral',
      modelId: 'magistral-small-2507',
      effort: 'provider-default',
    });
    expect(resolveActiveModelSelection({ modelId: 'pixtral-12b-2409' }, config)).toEqual({
      provider: 'mistral',
      modelId: 'pixtral-12b-2409',
      effort: 'provider-default',
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
            {
              id: 'mistral-small-latest',
              capabilities: { completion_chat: true },
              archived: false,
            },
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

describe('Reasoning Effort & Session Metadata', () => {
  it('should parse numeric 0-6 and string reasoning efforts', async () => {
    const { parseReasoningEffort } = await import('../src/engine/model-provider.js');

    expect(parseReasoningEffort(0)).toBe('provider-default');
    expect(parseReasoningEffort(1)).toBe('none');
    expect(parseReasoningEffort(2)).toBe('minimal');
    expect(parseReasoningEffort(3)).toBe('low');
    expect(parseReasoningEffort(4)).toBe('medium');
    expect(parseReasoningEffort(5)).toBe('high');
    expect(parseReasoningEffort(6)).toBe('xhigh');

    expect(parseReasoningEffort('0')).toBe('provider-default');
    expect(parseReasoningEffort('1')).toBe('none');
    expect(parseReasoningEffort('default')).toBe('provider-default');
    expect(parseReasoningEffort('none')).toBe('none');
    expect(parseReasoningEffort('off')).toBe('none');
    expect(parseReasoningEffort('low')).toBe('low');
    expect(parseReasoningEffort('med')).toBe('medium');
    expect(parseReasoningEffort('medium')).toBe('medium');
    expect(parseReasoningEffort('high')).toBe('high');
    expect(parseReasoningEffort('max')).toBe('xhigh');
    expect(parseReasoningEffort('xhigh')).toBe('xhigh');
    expect(parseReasoningEffort('invalid')).toBeUndefined();
  });

  it('should update sessionData.model when setModel is called on AgentSession', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-mock-key';
    process.env['GEMINI_API_KEY'] = 'mock-gemini-key';

    const { AgentSession } = await import('../src/engine/agent-session.js');
    const session = new AgentSession({ provider: 'openai', modelId: 'gpt-4o-mini' });

    expect(session.getModel().provider).toBe('openai');
    expect(session.session.model.provider).toBe('openai');
    expect(session.session.model.modelId).toBe('gpt-4o-mini');

    // Switch model to gemini
    session.setModel({ provider: 'gemini', modelId: 'gemini-2.5-flash' });

    // Verify BOTH getModel and sessionData.model are updated!
    expect(session.getModel().provider).toBe('gemini');
    expect(session.getModel().modelId).toBe('gemini-2.5-flash');
    expect(session.session.model.provider).toBe('gemini');
    expect(session.session.model.modelId).toBe('gemini-2.5-flash');
  });

  it('should update reasoning effort on AgentSession and sessionData.model', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-mock-key';

    const { AgentSession } = await import('../src/engine/agent-session.js');
    const session = new AgentSession({ provider: 'openai', modelId: 'gpt-4o-mini' });

    expect(session.getEffort()).toBe('provider-default');
    expect(session.session.model.effort).toBe('provider-default');

    session.setEffort('high');
    expect(session.getEffort()).toBe('high');
    expect(session.session.model.effort).toBe('high');
  });

  it('should parse legacy session schemas without effort gracefully', async () => {
    const { parseSessionDocument } = await import('../src/session/validate.js');

    const legacyRaw = JSON.stringify({
      schemaVersion: 1,
      id: 'legacy-session-1',
      name: 'Legacy Session',
      date: '2026-09-15',
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
      model: {
        provider: 'anthropic',
        modelId: 'claude-3-7-sonnet-20250219',
      },
      totalUsage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
      turns: [],
    });

    const parsed = parseSessionDocument(legacyRaw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.doc.model.provider).toBe('anthropic');
      expect(parsed.doc.model.modelId).toBe('claude-3-7-sonnet-20250219');
      expect(parsed.doc.model.effort).toBeUndefined();
    }
  });

  it('should log structured errors to logs directory with date and time', async () => {
    const { logError, getLogsRootDir } = await import('../src/errors/logger.js');
    const { existsSync, readFileSync } = await import('node:fs');

    const fakeError = new Error('Test API connection failure');
    (fakeError as any).statusCode = 429;

    const logPath = logError(fakeError, { sessionId: 'test-session-123' });
    expect(logPath).toBeTruthy();
    expect(existsSync(logPath)).toBe(true);

    const content = readFileSync(logPath, 'utf-8');
    expect(content).toContain('Test API connection failure');
    expect(content).toContain('test-session-123');
    expect(content).toContain('"category": "rate-limit"');
    expect(content).toContain('"statusCode": 429');
  });
});
