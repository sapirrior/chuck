import Component from '../engine/Component.js';
import type { TokenUsage } from '../../engine/types.js';
import { getTheme, figures } from '../../theme/index.js';
import { themeColor, chalk } from '../utils/format.js';
import { Box, Text } from '../primitives/index.js';

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
}

function formatTokens(n: number): string {
  if (n < 0) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export default class StatusBar extends Component<StatusBarProps, StatusBarState> {
  override wrap = false;
  override clip = true;

  private warningTimer: NodeJS.Timeout | null = null;

  constructor(props: StatusBarProps) {
    super(props);
    this.state = {
      model: props.model,
      usage: props.usage,
      isBusy: props.isBusy,
      exitPending: props.exitPending,
      warning: props.warning,
    };
  }

  update(partial: Partial<StatusBarState>): void {
    this.setState(partial);
  }

  /**
   * Displays a transient warning message that clears automatically after durationMs.
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
  }

  override render(width?: number): string[] {
    const theme = getTheme();
    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(1, termWidth);
    const { model, usage, isBusy, exitPending, warning } = this.state;

    let left = '';
    if (warning) {
      left = themeColor(theme.warning)(warning);
    } else if (exitPending) {
      const errColor = themeColor(theme.error);
      left = `${errColor('▸ ')}${chalk.dim('Press ')}${errColor('Ctrl+C')}${chalk.dim(' again to exit')}`;
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
