import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  isNewerVersion,
  parseSemver,
  UpdateCheckerService,
} from '../src/services/updater/index.js';

describe('UpdateCheckerService', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.STEWARD_NO_UPDATE_CHECK;

  beforeEach(() => {
    delete process.env.STEWARD_NO_UPDATE_CHECK;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.STEWARD_NO_UPDATE_CHECK = originalEnv;
    } else {
      delete process.env.STEWARD_NO_UPDATE_CHECK;
    }
  });

  describe('Semver comparison & parsing', () => {
    it('parses major, minor, patch and handles prefixes/prereleases', () => {
      expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
      expect(parseSemver('v1.2.3')).toEqual([1, 2, 3]);
      expect(parseSemver('1.2.3-alpha.1')).toEqual([1, 2, 3]);
      expect(parseSemver('invalid')).toEqual([0, 0, 0]);
      expect(parseSemver('')).toEqual([0, 0, 0]);
    });

    it('detects major version bumps', () => {
      expect(isNewerVersion('0.11.0', '1.0.0')).toBe(true);
      expect(isNewerVersion('1.0.0', '0.11.0')).toBe(false);
      expect(isNewerVersion('v0.11.0', 'v1.0.0')).toBe(true);
    });

    it('detects minor version bumps', () => {
      expect(isNewerVersion('0.11.0', '0.12.0')).toBe(true);
      expect(isNewerVersion('0.12.0', '0.11.0')).toBe(false);
      expect(isNewerVersion('v0.11.0', 'v0.12.1')).toBe(true);
    });

    it('detects patch version bumps', () => {
      expect(isNewerVersion('0.11.0', '0.11.1')).toBe(true);
      expect(isNewerVersion('0.11.5', '0.11.2')).toBe(false);
      expect(isNewerVersion('0.11.0', '0.11.0')).toBe(false);
    });
  });

  describe('Read-only update checks via mock fetch', () => {
    it('sets available state when upstream version is newer', async () => {
      let reportedState = '';
      let reportedMessage = '';

      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ version: '0.13.0' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const checker = new UpdateCheckerService({
        currentVersion: '0.12.0',
        minDisplayMs: 0,
        onStatusChange: (state, info) => {
          reportedState = state;
          if (info?.message) reportedMessage = info.message;
        },
      });

      const info = await checker.checkForUpdates();
      expect(info).not.toBeNull();
      expect(info?.hasUpdate).toBe(true);
      expect(info?.latestVersion).toBe('0.13.0');
      expect(checker.getState()).toBe('available');
      expect(reportedState).toBe('available');
      expect(reportedMessage).toBe('Update v0.13.0 is available');
      checker.dispose();
    });

    it('returns no-updates state when versions are equal', async () => {
      let reportedState = '';
      let reportedMessage = '';

      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ version: '0.12.0' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const checker = new UpdateCheckerService({
        currentVersion: '0.12.0',
        minDisplayMs: 0,
        onStatusChange: (state, info) => {
          reportedState = state;
          if (info?.message) reportedMessage = info.message;
        },
      });
      const info = await checker.checkForUpdates();
      expect(info?.hasUpdate).toBe(false);
      expect(checker.getState()).toBe('no-updates');
      expect(reportedState).toBe('no-updates');
      expect(reportedMessage).toBe('Steward is up to date (v0.12.0)');
      checker.dispose();
    });

    it('returns no-updates state when local is newer than upstream', async () => {
      let reportedState = '';
      let reportedMessage = '';

      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ version: '0.11.0' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const checker = new UpdateCheckerService({
        currentVersion: '0.12.0',
        minDisplayMs: 0,
        onStatusChange: (state, info) => {
          reportedState = state;
          if (info?.message) reportedMessage = info.message;
        },
      });
      const info = await checker.checkForUpdates();
      expect(info?.hasUpdate).toBe(false);
      expect(checker.getState()).toBe('no-updates');
      expect(reportedState).toBe('no-updates');
      expect(reportedMessage).toBe('Steward is up to date (v0.12.0)');
      checker.dispose();
    });

    it('handles network failure gracefully without throwing', async () => {
      globalThis.fetch = async () => {
        throw new Error('Network unreachable');
      };

      const checker = new UpdateCheckerService({ currentVersion: '0.12.0', minDisplayMs: 0 });
      const info = await checker.checkForUpdates();
      expect(info).toBeNull();
      expect(checker.getState()).toBe('error');
      checker.dispose();
    });

    it('handles non-200 HTTP response gracefully', async () => {
      globalThis.fetch = async () => {
        return new Response('Not found', { status: 404 });
      };

      const checker = new UpdateCheckerService({ currentVersion: '0.12.0', minDisplayMs: 0 });
      const info = await checker.checkForUpdates();
      expect(info).toBeNull();
      expect(checker.getState()).toBe('error');
      checker.dispose();
    });

    it('handles malformed JSON gracefully', async () => {
      globalThis.fetch = async () => {
        return new Response('{ not valid json', { status: 200 });
      };

      const checker = new UpdateCheckerService({ currentVersion: '0.12.0', minDisplayMs: 0 });
      const info = await checker.checkForUpdates();
      expect(info).toBeNull();
      expect(checker.getState()).toBe('error');
      checker.dispose();
    });

    it('skips check if STEWARD_NO_UPDATE_CHECK is set', async () => {
      process.env.STEWARD_NO_UPDATE_CHECK = '1';
      let fetchCalled = false;
      globalThis.fetch = async () => {
        fetchCalled = true;
        return new Response(JSON.stringify({ version: '1.0.0' }), { status: 200 });
      };

      const checker = new UpdateCheckerService({ currentVersion: '0.12.0' });
      const info = await checker.checkForUpdates();
      expect(info).toBeNull();
      expect(fetchCalled).toBe(false);
      checker.dispose();
    });

    it('does not expose an installer method and contains no mutation capabilities', () => {
      const checker = new UpdateCheckerService() as any;
      expect(checker.installUpdate).toBeUndefined();
      expect(checker.isUpdating).toBeUndefined();
      checker.dispose();
    });
  });
});
