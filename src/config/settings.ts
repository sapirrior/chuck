import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { ProviderName } from './env.js';

export type ReasoningEffort =
  'provider-default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface SavedModelSettings {
  provider: ProviderName;
  modelId: string;
  effort?: ReasoningEffort;
}

export interface TrustedFolderRecord {
  trustedAt: string;
}

/**
 * Persistent user settings stored in ~/.steward/settings.json
 */
export interface UserSettings {
  model?: SavedModelSettings;
  trustedFolders?: Record<string, TrustedFolderRecord>;
  voiceLanguage?: string;
}

/**
 * Resolves the directory path for steward configuration (~/.steward or overridden by STEWARD_SETTINGS_DIR).
 */
export function getSettingsDir(): string {
  if (process.env.STEWARD_SETTINGS_DIR) {
    return process.env.STEWARD_SETTINGS_DIR;
  }
  return join(homedir(), '.steward');
}

/**
 * Resolves the path to the user's settings file (~/.steward/settings.json).
 */
export function getSettingsPath(): string {
  return join(getSettingsDir(), 'settings.json');
}

/**
 * Safely loads user settings from ~/.steward/settings.json.
 * Returns default empty object if the file does not exist or cannot be parsed.
 */
export function loadSettings(): UserSettings {
  const filePath = getSettingsPath();
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as UserSettings;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Saves and updates user settings in ~/.steward/settings.json.
 */
export function saveSettings(updates: Partial<UserSettings>): UserSettings {
  const dirPath = getSettingsDir();
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  const current = loadSettings();
  const updated: UserSettings = {
    ...current,
    ...updates,
  };

  const filePath = getSettingsPath();
  writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');

  return updated;
}

/**
 * Returns the persisted model selection from ~/.steward/settings.json if present.
 */
export function getSavedModel(): SavedModelSettings | undefined {
  const settings = loadSettings();
  if (
    settings.model &&
    typeof settings.model.provider === 'string' &&
    typeof settings.model.modelId === 'string'
  ) {
    return {
      provider: settings.model.provider,
      modelId: settings.model.modelId,
      effort: settings.model.effort ?? 'provider-default',
    };
  }
  return undefined;
}

/**
 * Persists the user's selected model to ~/.steward/settings.json.
 */
export function saveModelSelection(selection: SavedModelSettings): void {
  saveSettings({
    model: {
      provider: selection.provider,
      modelId: selection.modelId,
      effort: selection.effort ?? 'provider-default',
    },
  });
}

/**
 * Returns the preferred voice transcription language tag from settings if configured.
 */
export function getVoiceLanguage(): string | undefined {
  const settings = loadSettings();
  return settings.voiceLanguage?.trim() || undefined;
}

/**
 * Persists the preferred voice transcription language tag to ~/.steward/settings.json.
 */
export function saveVoiceLanguage(languageTag: string): void {
  saveSettings({
    voiceLanguage: languageTag.trim(),
  });
}

/**
 * Normalizes a folder path for consistent trust lookups and storage.
 * Resolves symlinks, strips trailing separators, and adjusts case for case-insensitive OSes.
 */
export function normalizeFolderPath(inputPath: string): string {
  let absolute = resolve(inputPath);
  try {
    absolute = realpathSync(absolute);
  } catch {
    // Fall back to resolved absolute path if realpathSync throws
  }

  // Strip trailing path separator unless it is root (e.g. "/" or "C:\")
  if (absolute.length > 1 && absolute.endsWith(sep)) {
    absolute = absolute.slice(0, -1);
  }

  // Lowercase for darwin / win32 to handle case-insensitive filesystem matching
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return absolute.toLowerCase();
  }

  return absolute;
}

/**
 * Checks whether a folder (or any of its ancestor directories) is trusted in ~/.steward/settings.json.
 */
export function isFolderTrusted(absolutePath: string): boolean {
  const normalized = normalizeFolderPath(absolutePath);
  const settings = loadSettings();
  const trusted = settings.trustedFolders ?? {};

  if (trusted[normalized]) {
    return true;
  }

  // Check recursive trust: if an ancestor of this folder is trusted
  for (const trustedKey of Object.keys(trusted)) {
    const prefix = trustedKey.endsWith(sep) ? trustedKey : `${trustedKey}${sep}`;
    if (normalized.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Marks a folder as trusted in ~/.steward/settings.json.
 */
export function trustFolder(absolutePath: string): void {
  const normalized = normalizeFolderPath(absolutePath);
  const current = loadSettings();
  saveSettings({
    trustedFolders: {
      ...(current.trustedFolders ?? {}),
      [normalized]: {
        trustedAt: new Date().toISOString(),
      },
    },
  });
}
