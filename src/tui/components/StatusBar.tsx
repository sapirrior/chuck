import Component from '../engine/Component.js';
import type { TokenUsage } from '../../engine/types.js';
import { getTheme, figures } from '../../theme/index.js';
import { themeColor, chalk } from '../utils/format.js';
import { Box, Text } from '../primitives/index.js';

export type StatusBarVoiceState = 'idle' | 'connecting' | 'recording' | 'finishing';

export interface StatusBarUpdateStatus {
  state: 'idle' | 'checking' | 'no-updates' | 'available' | 'downloading' | 'ready' | 'error';
  version?: string;
  message?: string;
}

export interface StatusBarProps {
  model: {
    provider: string;
    modelId: string;
    effort?: string;
  };
  usage: TokenUsage;
  isBusy: boolean;
  exitPending?: boolean;
  warning?: string;
  voiceState?: StatusBarVoiceState;
  voiceDurationSec?: number;
  updateStatus?: StatusBarUpdateStatus;
}

export interface StatusBarState {
  model: {
    provider: string;
    modelId: string;
    effort?: string;
  };
  usage: TokenUsage;
  isBusy: boolean;
  exitPending?: boolean;
  warning?: string;
  voiceState?: StatusBarVoiceState;
  voiceDurationSec?: number;
  updateStatus?: StatusBarUpdateStatus;
}

function formatTokens(n: number): string {
  if (n < 0) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function formatVoiceDuration(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default class StatusBar extends Component<StatusBarProps, StatusBarState> {
  override wrap = false;
  override clip = true;

  private warningTimer: NodeJS.Timeout | null = null;
  private voiceTimer: NodeJS.Timeout | null = null;

  constructor(props: StatusBarProps) {
    super(props);
    this.state = {
      model: props.model,
      usage: props.usage,
      isBusy: props.isBusy,
      exitPending: props.exitPending,
      warning: props.warning,
      voiceState: props.voiceState ?? 'idle',
      voiceDurationSec: props.voiceDurationSec ?? 0,
    };
  }

  update(partial: Partial<StatusBarState>): void {
    this.setState(partial);
  }

  /**
   * Updates the voice recording status shown on the status bar in white text.
   */
  setVoiceState(voiceState: StatusBarVoiceState): void {
    if (this.voiceTimer) {
      clearInterval(this.voiceTimer);
      this.voiceTimer = null;
    }

    if (voiceState === 'recording') {
      this.setState({ voiceState, voiceDurationSec: 0 });
      this.voiceTimer = setInterval(() => {
        this.setState({ voiceDurationSec: (this.state.voiceDurationSec ?? 0) + 1 });
      }, 1000);
    } else {
      this.setState({
        voiceState,
        voiceDurationSec: voiceState === 'idle' ? 0 : this.state.voiceDurationSec,
      });
    }
  }

  /**
   * Updates the background updater status shown on the status bar.
   */
  setUpdateStatus(updateStatus?: StatusBarUpdateStatus): void {
    this.setState({ updateStatus });
  }

  /**
   * Displays a transient warning message in yellow that clears automatically after durationMs.
   */
  showWarning(warningText: string, durationMs = 4000): void {
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }

    this.setState({ warning: warningText });

    this.warningTimer = setTimeout(() => {
      this.warningTimer = null;
      if (this.state.warning === warningText) {
        this.setState({ warning: undefined });
      }
    }, durationMs);
  }

  override componentWillUnmount(): void {
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
    if (this.voiceTimer) {
      clearInterval(this.voiceTimer);
      this.voiceTimer = null;
    }
  }

  override render(width?: number): string[] {
    const theme = getTheme();
    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(1, termWidth);
    const {
      model,
      usage,
      isBusy,
      exitPending,
      warning,
      voiceState,
      voiceDurationSec,
      updateStatus,
    } = this.state;

    let left = '';
    if (warning) {
      left = themeColor(theme.warning)(warning);
    } else if (voiceState && voiceState !== 'idle') {
      if (voiceState === 'connecting') {
        left = `${chalk.white.bold('Connecting...')}   ${chalk.dim('Ctrl+T to stop')}`;
      } else if (voiceState === 'recording') {
        const timeStr = formatVoiceDuration(voiceDurationSec ?? 0);
        left = `${chalk.white.bold(`Recording... ${timeStr}`)}   ${chalk.dim('Ctrl+T to stop')}`;
      } else if (voiceState === 'finishing') {
        left = chalk.white.bold('Finishing...');
      }
    } else if (exitPending) {
      const errColor = themeColor(theme.error);
      left = `${errColor('▸ ')}${chalk.dim('Press ')}${errColor('Ctrl+C')}${chalk.dim(' again to exit')}`;
    } else if (updateStatus && updateStatus.state !== 'idle') {
      if (updateStatus.state === 'checking') {
        left = chalk.white(updateStatus.message ?? 'Checking for updates...');
      } else if (updateStatus.state === 'no-updates') {
        left = chalk.white(updateStatus.message ?? 'No updates found');
      } else if (updateStatus.state === 'available') {
        left = chalk.white(updateStatus.message ?? `Found version v${updateStatus.version ?? ''}`);
      } else if (updateStatus.state === 'downloading') {
        left = chalk.white(updateStatus.message ?? `Downloading v${updateStatus.version ?? ''}...`);
      } else if (updateStatus.state === 'ready') {
        left = chalk.white.bold(updateStatus.message ?? 'Update complete · Restart to apply');
      } else if (updateStatus.state === 'error' && updateStatus.message) {
        left = themeColor(theme.error)(updateStatus.message);
      } else if (isBusy) {
        left = chalk.dim('esc to interrupt');
      } else {
        left = chalk.dim('? for shortcuts');
      }
    } else if (isBusy) {
      left = chalk.dim('esc to interrupt');
    } else {
      left = chalk.dim('? for shortcuts');
    }

    const parts: string[] = [];
    if (usage && usage.totalTokens > 0) {
      parts.push(`${formatTokens(usage.totalTokens)} tokens`);
    }

    const effort = model?.effort ?? 'provider-default';
    const effortDisplay = effort === 'provider-default' ? 'default' : effort;
    parts.push(effortDisplay);

    const right =
      parts.length > 0 ? themeColor(theme.textMuted)(parts.join(` ${figures.bullet} `)) : '';

    const element = (
      <Box direction="row" justify="space-between" width={maxCols} clip={true}>
        <Text clip={true}>{left}</Text>
        <Text clip={true}>{right}</Text>
      </Box>
    );

    return element.render(maxCols);
  }
}
