import { describe, it, expect } from 'bun:test';
import { isNewerVersion, AutoUpdaterService } from '../src/services/updater/index.js';

describe('AutoUpdaterService', () => {
  describe('isNewerVersion semver comparison', () => {
    it('detects major version bumps', () => {
      expect(isNewerVersion('0.11.0', '1.0.0')).toBe(true);
      expect(isNewerVersion('1.0.0', '0.11.0')).toBe(false);
      expect(isNewerVersion('v0.11.0', 'v1.0.0')).toBe(true);
    });

    it('detects minor version bumps', () => {
      expect(isNewerVersion('0.11.0', '0.12.0')).toBe(true);
      expect(isNewerVersion('0.12.0', '0.11.0')).toBe(false);
      expect(isNewerVersion('v0.11.0', 'v0.11.1')).toBe(true);
    });

    it('detects patch version bumps', () => {
      expect(isNewerVersion('0.11.0', '0.11.1')).toBe(true);
      expect(isNewerVersion('0.11.5', '0.11.2')).toBe(false);
      expect(isNewerVersion('0.11.0', '0.11.0')).toBe(false);
    });
  });

  describe('Service lifecycle', () => {
    it('starts in idle state', () => {
      const updater = new AutoUpdaterService({ currentVersion: '0.11.0' });
      expect(updater.getState()).toBe('idle');
      updater.dispose();
    });
  });
});
