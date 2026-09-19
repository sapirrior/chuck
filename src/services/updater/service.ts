import pkg from '../../../package.json' with { type: 'json' };
import { logError } from '../../errors/index.js';
import type { UpdateCheckerOptions, UpdateInfo, UpdateState } from './types.js';

const DEFAULT_REPO = 'sapirrior/steward';

export function parseSemver(v: string): [number, number, number] {
  if (!v || typeof v !== 'string') {
    return [0, 0, 0];
  }
  const clean = v.replace(/^v/i, '').trim().split('-')[0] ?? '';
  const parts = clean.split('.').map((p) => parseInt(p, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function isNewerVersion(current: string, latest: string): boolean {
  const [cMaj, cMin, cPat] = parseSemver(current);
  const [lMaj, lMin, lPat] = parseSemver(latest);

  if (lMaj > cMaj) return true;
  if (lMaj < cMaj) return false;

  if (lMin > cMin) return true;
  if (lMin < cMin) return false;

  return lPat > cPat;
}

export class UpdateCheckerService {
  private currentVersion: string;
  private repo: string;
  private state: UpdateState = 'idle';
  private options: UpdateCheckerOptions;
  private checkTimer: NodeJS.Timeout | null = null;
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(options: UpdateCheckerOptions = {}) {
    this.options = options;
    this.currentVersion = options.currentVersion || (pkg.version as string) || '0.0.0';
    this.repo = options.repo || DEFAULT_REPO;
  }

  public getState(): UpdateState {
    return this.state;
  }

  public getRepo(): string {
    return this.repo;
  }

  public getCurrentVersion(): string {
    return this.currentVersion;
  }

  private get rawPackageJsonUrl(): string {
    return `https://raw.githubusercontent.com/${this.repo}/main/package.json`;
  }

  private setState(state: UpdateState, info?: { version?: string; message?: string }): void {
    this.state = state;
    this.options.onStatusChange?.(state, info);
  }

  /**
   * Performs a read-only fetch to upstream main/package.json to check for newer versions.
   */
  public async checkForUpdates(): Promise<UpdateInfo | null> {
    if (
      process.env.STEWARD_NO_UPDATE_CHECK === '1' ||
      process.env.STEWARD_NO_UPDATE_CHECK === 'true'
    ) {
      return null;
    }

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    try {
      this.setState('checking', { message: 'Checking for updates...' });
      const checkStartTime = Date.now();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10000);

      const response = await fetch(this.rawPackageJsonUrl, {
        headers: {
          'User-Agent': `steward-cli/${this.currentVersion}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const elapsed = Date.now() - checkStartTime;
      const targetMinDisplay =
        this.options.minDisplayMs !== undefined ? this.options.minDisplayMs : 1000;
      const minDisplayDelay = Math.max(0, targetMinDisplay - elapsed);
      if (minDisplayDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, minDisplayDelay));
      }

      if (!response.ok) {
        this.setState('error', { message: 'Failed to check for updates' });
        this.resetTimer = setTimeout(() => {
          if (this.state === 'error') this.setState('idle');
        }, 3000);
        return null;
      }

      const data = (await response.json()) as { version?: unknown };
      if (!data || typeof data !== 'object' || typeof data.version !== 'string') {
        this.setState('error', { message: 'Invalid upstream version response' });
        this.resetTimer = setTimeout(() => {
          if (this.state === 'error') this.setState('idle');
        }, 3000);
        return null;
      }

      const latestVersion = data.version.replace(/^v/i, '').trim();
      if (!latestVersion) {
        this.setState('error', { message: 'Empty upstream version response' });
        this.resetTimer = setTimeout(() => {
          if (this.state === 'error') this.setState('idle');
        }, 3000);
        return null;
      }

      const hasUpdate = isNewerVersion(this.currentVersion, latestVersion);

      const updateInfo: UpdateInfo = {
        currentVersion: this.currentVersion,
        latestVersion,
        hasUpdate,
      };

      if (hasUpdate) {
        this.setState('available', {
          version: latestVersion,
          message: `Update v${latestVersion} is available`,
        });
      } else {
        this.setState('no-updates', {
          version: this.currentVersion,
          message: `Steward is up to date (v${this.currentVersion})`,
        });
        this.resetTimer = setTimeout(() => {
          if (this.state === 'no-updates') this.setState('idle');
        }, 3500);
      }

      return updateInfo;
    } catch (err) {
      logError(err, { component: 'UpdateCheckerService', method: 'checkForUpdates' });
      this.setState('error', { message: 'Failed to check for updates' });
      this.resetTimer = setTimeout(() => {
        if (this.state === 'error') this.setState('idle');
      }, 3000);
      return null;
    }
  }

  /**
   * Starts a non-blocking delayed background check on application startup.
   */
  public startBackgroundCheck(initialDelayMs = 2000): void {
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
    }

    this.checkTimer = setTimeout(async () => {
      this.checkTimer = null;
      await this.checkForUpdates();
    }, initialDelayMs);
  }

  public dispose(): void {
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}
