import { describe, expect, it } from 'bun:test';
import {
  getVoiceModel,
  VOICE_MODEL_ID,
  classifyVoiceError,
  checkVoicePrerequisites,
  TranscriptAccumulator,
  ParecAudioRecorder,
  ArecordAudioRecorder,
  GeminiLiveTranscriptionSession,
  VoiceController,
  type RecorderProcess,
} from '../../src/voice/index.js';

describe('Voice Subsystem Pure Modules', () => {
  describe('Model Descriptors & Isolation', () => {
    it('returns the fixed Gemini live transcription model descriptor', () => {
      const model = getVoiceModel();
      expect(model.provider).toBe('gemini');
      expect(model.modelId).toBe('gemini-3.5-transcribe-live');
      expect(model.mode).toBe('live-transcription');
      expect(model.responseModality).toBe('text');
      expect(VOICE_MODEL_ID).toBe('gemini-3.5-transcribe-live');
    });
  });

  describe('Error Classification', () => {
    it('classifies missing API key errors', () => {
      const res = classifyVoiceError('GEMINI_API_KEY is not configured');
      expect(res.category).toBe('not-configured');
      expect(res.warning).toContain('configure GEMINI_API_KEY');
    });

    it('classifies missing parec binary errors', () => {
      const res = classifyVoiceError('parec is not installed on system');
      expect(res.category).toBe('arecord-missing');
      expect(res.warning).toContain('parec is not installed');
    });

    it('classifies 401 authentication errors', () => {
      const res = classifyVoiceError(new Error('HTTP 401 Unauthorized: Invalid API key'));
      expect(res.category).toBe('auth');
      expect(res.warning).toContain('invalid GEMINI_API_KEY');
    });

    it('classifies 429 rate limit quota errors', () => {
      const res = classifyVoiceError('RESOURCE_EXHAUSTED: Rate limit exceeded (429)');
      expect(res.category).toBe('rate-limit');
      expect(res.warning).toContain('Gemini rate limit reached');
    });

    it('classifies network disconnection errors', () => {
      const res = classifyVoiceError(new Error('WebSocket connection lost: ECONNRESET'));
      expect(res.category).toBe('network');
      expect(res.warning).toContain('network connection lost');
    });

    it('classifies timeout errors', () => {
      const res = classifyVoiceError('Timed out waiting for Gemini Live setup confirmation.');
      expect(res.category).toBe('timeout');
      expect(res.warning).toContain('transcription timed out');
    });

    it('classifies service unavailable errors', () => {
      const res = classifyVoiceError('HTTP 503 Service Unavailable');
      expect(res.category).toBe('service-unavailable');
      expect(res.warning).toContain('Gemini service unavailable');
    });

    it('classifies parec failure', () => {
      const res = classifyVoiceError('parec exited unexpectedly with code 1');
      expect(res.category).toBe('arecord-failed');
      expect(res.warning).toContain('microphone recording failed');
    });
  });

  describe('Prerequisite Verification', () => {
    it('fails if Gemini API key is missing', async () => {
      const res = await checkVoicePrerequisites({
        config: { custom: {} },
        checkParecFn: async () => true,
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('not-configured');
      expect(res.warning).toContain('configure GEMINI_API_KEY');
    });

    it('fails if parec is missing', async () => {
      const res = await checkVoicePrerequisites({
        config: { geminiApiKey: 'test-api-key', custom: {} },
        checkParecFn: async () => false,
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('arecord-missing');
      expect(res.warning).toContain('parec');
    });

    it('succeeds when both Gemini key and parec are available', async () => {
      const res = await checkVoicePrerequisites({
        config: { geminiApiKey: 'test-api-key', custom: {} },
        checkParecFn: async () => true,
      });
      expect(res.ok).toBe(true);
      expect(res.apiKey).toBe('test-api-key');
    });
  });

  describe('Transcript Accumulator', () => {
    it('replaces interim hypothesis and merges final segments without duplication', () => {
      const acc = new TranscriptAccumulator();

      // 1. Interim token
      acc.addEvent({ text: 'Hello', isFinal: false });
      expect(acc.getVisibleText()).toBe('Hello');

      // 2. Updated interim hypothesis
      acc.addEvent({ text: 'Hello world', isFinal: false });
      expect(acc.getVisibleText()).toBe('Hello world');

      // 3. Finalized first segment
      acc.addEvent({ text: 'Hello world', isFinal: true });
      expect(acc.getVisibleText()).toBe('Hello world');

      // 4. Next interim hypothesis
      acc.addEvent({ text: 'this is', isFinal: false });
      expect(acc.getVisibleText()).toBe('Hello world this is');

      // 5. Next interim updated
      acc.addEvent({ text: 'this is Steward', isFinal: false });
      expect(acc.getVisibleText()).toBe('Hello world this is Steward');

      // 6. Finalized second segment
      acc.addEvent({ text: 'this is Steward speaking', isFinal: true });
      expect(acc.getVisibleText()).toBe('Hello world this is Steward speaking');
      expect(acc.getFinalizedText()).toBe('Hello world this is Steward speaking');
    });

    it('preserves partial interim transcript when finalized on stop/error', () => {
      const acc = new TranscriptAccumulator();
      acc.addEvent({ text: 'Refactor the authentication flow', isFinal: true });
      acc.addEvent({ text: 'so that token rotation', isFinal: false });

      expect(acc.getFinalizedText()).toBe(
        'Refactor the authentication flow so that token rotation',
      );
    });

    it('normalizes whitespace and ignores empty events', () => {
      const acc = new TranscriptAccumulator();
      acc.addEvent({ text: '   ', isFinal: false });
      expect(acc.getVisibleText()).toBe('');

      acc.addEvent({ text: '  const foo = 42;  ', isFinal: true });
      expect(acc.getFinalizedText()).toBe('const foo = 42;');
    });
  });

  describe('Language Code Validation & Preferences', () => {
    it('validates and normalizes valid BCP-47 language codes', async () => {
      const { resolveVoiceLanguage } = await import('../../src/cli/commands/config/utils/lang.js');
      expect(resolveVoiceLanguage('en-US')?.tag).toBe('en-US');
      expect(resolveVoiceLanguage('en_US')?.tag).toBe('en-US');
      expect(resolveVoiceLanguage('en us')?.tag).toBe('en-US');
      expect(resolveVoiceLanguage('es-ES')?.tag).toBe('es-ES');
      expect(resolveVoiceLanguage('fr-FR')?.tag).toBe('fr-FR');
      expect(resolveVoiceLanguage('de-DE')?.tag).toBe('de-DE');
      expect(resolveVoiceLanguage('ja-JP')?.tag).toBe('ja-JP');
      expect(resolveVoiceLanguage('zh-CN')?.tag).toBe('zh-CN');
      expect(resolveVoiceLanguage('en')?.tag).toBe('en-US');
      expect(resolveVoiceLanguage('ja')?.tag).toBe('ja-JP');
    });

    it('rejects invalid language codes', async () => {
      const { resolveVoiceLanguage } = await import('../../src/cli/commands/config/utils/lang.js');
      expect(resolveVoiceLanguage('')).toBeNull();
      expect(resolveVoiceLanguage('invalid-12345-tag-xyz')).toBeNull();
      expect(resolveVoiceLanguage('12345')).toBeNull();
      expect(resolveVoiceLanguage('!!not_a_lang!!')).toBeNull();
    });
  });
});
