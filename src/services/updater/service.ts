import { spawn } from 'node:child_process';
import pkg from '../../../package.json' with { type: 'json' };
import { logError } from '../../errors/index.js';
import type { AutoUpdaterOptions, UpdateInfo, UpdateState } from './types.js';

const DEFAULT_REPO = 'sapirrior/steward';

function parseSemver(v: string): [number, number, number] {
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

export class AutoUpdaterService {
  private currentVersion: string;
  private repo: string;
  private state: UpdateState = 'idle';
  private options: AutoUpdaterOptions;
  private checkTimer: NodeJS.Timeout | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isUpdating = false;

  constructor(options: AutoUpdaterOptions = {}) {
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

  private get latestReleaseApi(): string {
    return `https://api.github.com/repos/${this.repo}/releases/latest`;
  }

  private get installShUrl(): string {
    return `https://raw.githubusercontent.com/${this.repo}/main/installer/install.sh`;
  }

  private get installPs1Url(): string {
    return `https://raw.githubusercontent.com/${this.repo}/main/installer/install.ps1`;
  }

  private setState(state: UpdateState, info?: { version?: string; message?: string }): void {
    this.state = state;
    this.options.onStatusChange?.(state, info);
  }

  /**
   * Checks GitHub releases API for the latest version tag.
   */
  public async checkForUpdates(): Promise<UpdateInfo | null> {
    if (
      process.env.STEWARD_NO_UPDATE_CHECK === '1' ||
      process.env.STEWARD_NO_UPDATE_CHECK === 'true'
    ) {
      return null;
    }

    try {
      this.setState('checking', { message: 'Checking for updates...' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10000);

      const response = await fetch(this.latestReleaseApi, {
        headers: {
          'User-Agent': `steward-cli/${this.currentVersion}`,
          Accept: 'application/vnd.github.v3+json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.setState('idle');
        return null;
      }

      const data = (await response.json()) as { tag_name?: string; html_url?: string };
      const rawTag = data.tag_name ?? '';
      const latestVersion = rawTag.replace(/^v/i, '').trim();

      if (!latestVersion) {
        this.setState('idle');
        return null;
      }

      const hasUpdate = isNewerVersion(this.currentVersion, latestVersion);

      const updateInfo: UpdateInfo = {
        currentVersion: this.currentVersion,
        latestVersion,
        hasUpdate,
        tag: rawTag,
        releaseUrl: data.html_url,
      };

      if (hasUpdate) {
        this.setState('available', {
          version: latestVersion,
          message: `Found version v${latestVersion}`,
        });
      } else {
        this.setState('no-updates', { message: 'No updates found' });
        setTimeout(() => {
          if (this.state === 'no-updates') {
            this.setState('idle');
          }
        }, 3000);
      }

      return updateInfo;
    } catch (err) {
      logError(err, { component: 'AutoUpdaterService', method: 'checkForUpdates' });
      this.setState('idle');
      return null;
    }
  }

  /**
   * Downloads and installs the update in the background using the platform installer script.
   */
  public async installUpdate(version: string): Promise<boolean> {
    if (this.isUpdating) return false;
    this.isUpdating = true;
    this.setState('downloading', {
      version,
      message: `Downloading v${version}...`,
    });

    try {
      const isWindows = process.platform === 'win32';
      let childProcess;

      if (isWindows) {
        childProcess = spawn(
          'powershell',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `irm ${this.installPs1Url} | iex`,
          ],
          {
            stdio: 'ignore',
            windowsHide: true,
          },
        );
      } else {
        childProcess = spawn('bash', ['-c', `curl -fsSL ${this.installShUrl} | bash`], {
          stdio: 'ignore',
          env: {
            ...process.env,
            HOME: process.env.HOME || '',
            PATH: process.env.PATH || '',
          },
        });
      }

      const success = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          try {
            childProcess.kill();
          } catch {}
          resolve(false);
        }, 300000); // 5 min timeout

        childProcess.on('exit', (code) => {
          clearTimeout(timeout);
          resolve(code === 0);
        });

        childProcess.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });

      if (success) {
        this.setState('ready', {
          version,
          message: `Update complete · Restart to apply`,
        });
        return true;
      } else {
        this.setState('error', {
          version,
          message: `Update to v${version} failed`,
        });
        setTimeout(() => {
          if (this.state === 'error') {
            this.setState('idle');
          }
        }, 4000);
        return false;
      }
    } catch (err) {
      logError(err, { component: 'AutoUpdaterService', method: 'installUpdate' });
      this.setState('error', { version, message: 'Update failed' });
      setTimeout(() => {
        if (this.state === 'error') {
          this.setState('idle');
        }
      }, 4000);
      return false;
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Starts a non-blocking background check after initialDelayMs, automatically
   * downloading and installing if an update is found.
   */
  public startBackgroundCheck(initialDelayMs = 2000, intervalMs?: number): void {
    if (this.checkTimer) clearTimeout(this.checkTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);

    const performCheck = async () => {
      const update = await this.checkForUpdates();
      if (update && update.hasUpdate) {
        // Small delay to let user see "Found version vN..." before downloading
        setTimeout(async () => {
          await this.installUpdate(update.latestVersion);
        }, 1200);
      }
    };

    this.checkTimer = setTimeout(async () => {
      this.checkTimer = null;
      await performCheck();

      const recurringInterval = intervalMs ?? this.options.checkIntervalMs;
      if (recurringInterval && recurringInterval > 0) {
        this.intervalTimer = setInterval(performCheck, recurringInterval);
      }
    }, initialDelayMs);
  }

  public dispose(): void {
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}
