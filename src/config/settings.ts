import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderName } from './env.js';

export interface SavedModelSettings {
  provider: ProviderName;
  modelId: string;
}

/**
 * Persistent user settings stored in ~/.chuck/settings.json
 */
export interface UserSettings {
  model?: SavedModelSettings;
}

/**
 * Resolves the path to the user's settings file (~/.chuck/settings.json).
 */
export function getSettingsPath(): string {
  const home = homedir();
  return join(home, '.chuck', 'settings.json');
}

/**
 * Resolves the directory path for chuck configuration (~/.chuck).
 */
export function getSettingsDir(): string {
  const home = homedir();
  return join(home, '.chuck');
}

/**
 * Safely loads user settings from ~/.chuck/settings.json.
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
 * Saves and updates user settings in ~/.chuck/settings.json.
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
 * Returns the persisted model selection from ~/.chuck/settings.json if present.
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
    };
  }
  return undefined;
}

/**
 * Persists the user's selected model to ~/.chuck/settings.json.
 */
export function saveModelSelection(selection: SavedModelSettings): void {
  saveSettings({
    model: {
      provider: selection.provider,
      modelId: selection.modelId,
    },
  });
}
