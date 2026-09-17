import { getEnvConfig, hasProviderConfig, type EnvConfig } from '../config/index.js';
import type { VoiceErrorCategory } from './types.js';

export interface PrerequisiteCheckResult {
  ok: boolean;
  reason?: VoiceErrorCategory;
  warning?: string;
  apiKey?: string;
}

export interface PrerequisiteOptions {
  config?: EnvConfig;
  checkArecordFn?: () => Promise<boolean>;
}

/**
 * Checks if arecord is installed and runnable on the host machine.
 */
export async function defaultCheckArecord(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['which', 'arecord'], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Validates local prerequisites for voice dictation:
 * 1. Gemini API key is configured
 * 2. arecord executable is available
 */
export async function checkVoicePrerequisites(
  options: PrerequisiteOptions = {},
): Promise<PrerequisiteCheckResult> {
  const config = options.config ?? getEnvConfig();
  const checkArecord = options.checkArecordFn ?? defaultCheckArecord;

  // 1. Check Gemini API key
  const hasGemini = hasProviderConfig('gemini', config);
  const geminiApiKey = config.geminiApiKey;

  if (!hasGemini || !geminiApiKey) {
    return {
      ok: false,
      reason: 'not-configured',
      warning: '⚠ Voice unavailable: configure GEMINI_API_KEY',
    };
  }

  // 2. Check arecord binary
  const arecordAvailable = await checkArecord();
  if (!arecordAvailable) {
    return {
      ok: false,
      reason: 'arecord-missing',
      warning: '⚠ Voice unavailable: arecord is not installed',
    };
  }

  return {
    ok: true,
    apiKey: geminiApiKey,
  };
}

/**
 * Validates local prerequisites for voice dictation:
 * 1. Gemini API key is configured
 * 2. Audio recorder executable is available (arecord or parec)
 */
export async function checkVoicePrerequisites(
  options: PrerequisiteOptions = {},
): Promise<PrerequisiteCheckResult> {
  const config = options.config ?? getEnvConfig();
  const checkArecord = options.checkArecordFn ?? defaultCheckArecord;

  // 1. Check Gemini API key
  const hasGemini = hasProviderConfig('gemini', config);
  const geminiApiKey = config.geminiApiKey;

  if (!hasGemini || !geminiApiKey) {
    return {
      ok: false,
      reason: 'not-configured',
      warning: '⚠ Voice unavailable: configure GEMINI_API_KEY',
    };
  }

  // 2. Check audio capture binary
  const arecordAvailable = await checkArecord();
  if (!arecordAvailable) {
    return {
      ok: false,
      reason: 'arecord-missing',
      warning: '⚠ Voice unavailable: arecord or parec is not installed',
    };
  }

  return {
    ok: true,
    apiKey: geminiApiKey,
  };
}
