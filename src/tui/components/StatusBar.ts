import Component from '../engine/Component.js';
import type { TokenUsage } from '../../engine/types.js';
import { getTheme, figures } from '../../theme/index.js';
import { themeColor, chalk, stripAnsi, truncateToWidth } from '../utils/format.js';
import { MAX_READABLE_WIDTH } from '../engine/cell-layout.js';
import stringWidth from 'string-width';

export interface StatusBarProps {
  model: {
    provider: string;
    modelId: string;
  };
  usage: TokenUsage;
  isBusy: boolean;
  exitPending?: boolean;
}

export interface StatusBarState {
  model: {
    provider: string;
    modelId: string;
  };
  usage: TokenUsage;
  isBusy: boolean;
  exitPending?: boolean;
}

function formatTokens(n: number): string {
  if (n < 0) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export default class StatusBar extends Component<StatusBarProps, StatusBarState> {
  constructor(props: StatusBarProps) {
    super(props);
    this.state = {
      model: props.model,
      usage: props.usage,
      isBusy: props.isBusy,
      exitPending: props.exitPending,
    };
  }

  update(partial: Partial<StatusBarState>): void {
    this.setState(partial);
  }

  override render(width?: number): string[] {
    const theme = getTheme();
    const termWidth = width ?? process.stdout.columns ?? 80;
    const { model, usage, exitPending } = this.state;

    let left = '';
    if (exitPending) {
      const errColor = themeColor(theme.error);
      left = `${errColor('▸ ')}${chalk.dim('Press ')}${errColor('Ctrl+C')}${chalk.dim(' again to exit')}`;
    } else {
      left = themeColor(theme.textMuted)('? for shortcuts');
    }

    let right = chalk.dim(model.modelId || `${model.provider}/${model.modelId}`);
    if (usage && usage.totalTokens > 0) {
      const bullet = themeColor(theme.subtle)(` ${figures.bullet} `);
      const tokStr = themeColor(theme.textMuted)(`${formatTokens(usage.totalTokens)} tokens`);
      right += `${bullet}${tokStr}`;
    }

    const leftWidth = stringWidth(stripAnsi(left));
    let rightWidth = stringWidth(stripAnsi(right));
    const minGap = 1;
    const maxRightWidth = Math.max(0, termWidth - 1 - leftWidth - minGap);
    if (rightWidth > maxRightWidth) {
      // drop the token-count segment first, then hard-truncate the model id
      right = chalk.dim(model.modelId || `${model.provider}/${model.modelId}`);
      rightWidth = stringWidth(stripAnsi(right));
      if (rightWidth > maxRightWidth) {
        right = truncateToWidth(right, maxRightWidth);
        rightWidth = stringWidth(stripAnsi(right));
      }
    }
    const spaceCount = Math.max(1, termWidth - 1 - leftWidth - rightWidth);
    const line = truncateToWidth(
      `${left}${' '.repeat(spaceCount)}${right}`,
      Math.max(0, termWidth - 1),
    );

    return [line];
  }
}
