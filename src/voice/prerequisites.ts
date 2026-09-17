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
  checkParecFn?: () => Promise<boolean>;
  /** @deprecated Kept for legacy test option compatibility */
  checkArecordFn?: () => Promise<boolean>;
}

/**
 * Checks if parec (PulseAudio) is installed and runnable on the host machine.
 */
export async function defaultCheckParec(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['which', 'parec'], {
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
 * 2. parec (PulseAudio recorder) executable is available
 */
export async function checkVoicePrerequisites(
  options: PrerequisiteOptions = {},
): Promise<PrerequisiteCheckResult> {
  const config = options.config ?? getEnvConfig();
  const checkRecorder = options.checkParecFn ?? options.checkArecordFn ?? defaultCheckParec;

  // 1. Check Gemini API key
  const hasGemini = hasProviderConfig('gemini', config);
  const geminiApiKey = config.geminiApiKey;

  if (!hasGemini || !geminiApiKey) {
    return {
      ok: false,
      reason: 'not-configured',
      warning: 'Voice unavailable: configure GEMINI_API_KEY',
    };
  }

  // 2. Check parec binary
  const recorderAvailable = await checkRecorder();
  if (!recorderAvailable) {
    return {
      ok: false,
      reason: 'arecord-missing',
      warning: 'Voice unavailable: parec is not installed (install pulseaudio-utils)',
    };
  }

  return {
    ok: true,
    apiKey: geminiApiKey,
  };
}
