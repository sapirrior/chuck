import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isFolderTrusted,
  trustFolder,
  normalizeFolderPath,
  loadSettings,
  saveSettings,
} from '../src/config/index.js';

describe('Workspace Trust & Path Normalization', () => {
  let tempSettingsDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tempSettingsDir = mkdtempSync(join(tmpdir(), 'steward-trust-test-'));
    originalEnv = process.env.STEWARD_SETTINGS_DIR;
    process.env.STEWARD_SETTINGS_DIR = tempSettingsDir;
  });

  afterEach(() => {
    process.env.STEWARD_SETTINGS_DIR = originalEnv;
    try {
      rmSync(tempSettingsDir, { recursive: true, force: true });
    } catch {}
  });

  it('should return false for untrusted folder by default', () => {
    expect(isFolderTrusted('/some/random/untrusted/path')).toBe(false);
  });

  it('should trust folder and persist decision in settings.json', () => {
    const testPath = join(tempSettingsDir, 'my-repo');
    mkdirSync(testPath, { recursive: true });

    expect(isFolderTrusted(testPath)).toBe(false);
    trustFolder(testPath);
    expect(isFolderTrusted(testPath)).toBe(true);

    const settings = loadSettings();
    expect(settings.trustedFolders).toBeDefined();
    const normalized = normalizeFolderPath(testPath);
    expect(settings.trustedFolders?.[normalized]?.trustedAt).toBeDefined();
  });

  it('should normalize trailing slashes identically', () => {
    const testPath = join(tempSettingsDir, 'trailing-slash-test');
    mkdirSync(testPath, { recursive: true });

    trustFolder(`${testPath}/`);
    expect(isFolderTrusted(testPath)).toBe(true);
    expect(isFolderTrusted(`${testPath}/`)).toBe(true);
  });

  it('should normalize symlinked paths to their real paths', () => {
    const realDir = join(tempSettingsDir, 'real-target');
    const symlinkDir = join(tempSettingsDir, 'symlink-target');
    mkdirSync(realDir, { recursive: true });

    try {
      symlinkSync(realDir, symlinkDir, 'dir');
    } catch {
      // Symlink creation might require privileges on some platforms
      return;
    }

    trustFolder(symlinkDir);
    expect(isFolderTrusted(realDir)).toBe(true);
    expect(isFolderTrusted(symlinkDir)).toBe(true);
  });

  it('should recursively inherit trust for subdirectories within a trusted workspace', () => {
    const rootDir = join(tempSettingsDir, 'parent-workspace');
    const subDir = join(rootDir, 'packages', 'core');
    const siblingDir = join(tempSettingsDir, 'other-workspace');

    mkdirSync(subDir, { recursive: true });
    mkdirSync(siblingDir, { recursive: true });

    trustFolder(rootDir);

    expect(isFolderTrusted(rootDir)).toBe(true);
    expect(isFolderTrusted(subDir)).toBe(true);
    expect(isFolderTrusted(siblingDir)).toBe(false);
  });

  it('should preserve existing settings when adding a trusted folder', () => {
    saveSettings({
      model: {
        provider: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        effort: 'high',
      },
    });

    const testPath = join(tempSettingsDir, 'preserve-test');
    mkdirSync(testPath, { recursive: true });

    trustFolder(testPath);

    const settings = loadSettings();
    expect(settings.model?.modelId).toBe('claude-3-7-sonnet');
    expect(isFolderTrusted(testPath)).toBe(true);
  });

  it('should load pre-existing settings.json with no trustedFolders field gracefully', () => {
    const settingsFile = join(tempSettingsDir, 'settings.json');
    writeFileSync(
      settingsFile,
      JSON.stringify({ model: { provider: 'openai', modelId: 'gpt-4o' } }),
    );

    const settings = loadSettings();
    expect(settings.trustedFolders).toBeUndefined();
    expect(isFolderTrusted('/any/dir')).toBe(false);
  });
});
