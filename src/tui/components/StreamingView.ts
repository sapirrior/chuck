import Component from '../engine/Component.js';
import { getTheme, figures } from '../../theme/index.js';
import { themeColor, chalk, formatMarkdown } from '../utils/format.js';
import { wrapVisualLine } from '../engine/cell-layout.js';

export interface ActiveToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  startTime: number;
  recentLines?: string[];
}

export interface StreamingViewState {
  text: string;
  isStreaming: boolean;
  activeTool?: ActiveToolCall | null;
  pulseFrame: number;
}

export default class StreamingView extends Component<{}, StreamingViewState> {
  override overflow = 'wrap' as const;
  override truncation = 'none' as const;
  private pulseTimer: NodeJS.Timeout | null = null;

  constructor() {
    super({});
    this.state = {
      text: '',
      isStreaming: false,
      activeTool: null,
      pulseFrame: 0,
    };
  }

  setStream(text: string, isStreaming: boolean): void {
    this.setState({ text, isStreaming });
    this.ensurePulse();
  }

  setActiveTool(tool: ActiveToolCall | null): void {
    this.setState({ activeTool: tool });
    this.ensurePulse();
  }

  updateToolOutput(recentLines: string[]): void {
    if (this.state.activeTool) {
      this.setState({
        activeTool: {
          ...this.state.activeTool,
          recentLines,
        },
      });
    }
  }

  private ensurePulse(): void {
    if ((this.state.isStreaming || this.state.activeTool) && !this.pulseTimer) {
      this.pulseTimer = setInterval(() => {
        this.setState({ pulseFrame: this.state.pulseFrame + 1 });
      }, 150);
    } else if (!this.state.isStreaming && !this.state.activeTool && this.pulseTimer) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
  }

  reset(): void {
    if (this.pulseTimer) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
    this.setState({ text: '', isStreaming: false, activeTool: null, pulseFrame: 0 });
  }

  override componentWillUnmount(): void {
    if (this.pulseTimer) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
  }

  override render(width?: number): string[] {
    const { text, isStreaming, activeTool, pulseFrame } = this.state;
    if (!isStreaming && !text && !activeTool) return [];

    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(1, termWidth);
    const textWidth = Math.max(1, Math.min(96, maxCols) - 2);

    const lines: string[] = [];

    // 1. Ongoing active tool call (streaming live output)
    if (activeTool) {
      // Blinking white bullet for in-progress tool call
      const isBright = pulseFrame % 2 === 0;
      const bullet = isBright
        ? chalk.white.bold(figures.blackCircle)
        : chalk.dim(figures.blackCircle);
      const toolName = activeTool.name.charAt(0).toUpperCase() + activeTool.name.slice(1);

      let targetArg = '';
      if (activeTool.args) {
        const primary =
          activeTool.args.path ||
          activeTool.args.command ||
          activeTool.args.target_file ||
          activeTool.args.url ||
          activeTool.args.pattern;
        if (primary) {
          targetArg = String(primary).split('\n')[0] ?? '';
        }
      }

      let line = `${bullet} ${toolName}`;
      if (targetArg) {
        line += `${chalk.dim('(')}${chalk.dim(targetArg.slice(0, 48))}${chalk.dim(')')}`;
      }
      lines.push(line);

      if (activeTool.recentLines && activeTool.recentLines.length > 0) {
        const toShow = activeTool.recentLines.slice(-10);
        for (let i = 0; i < toShow.length; i++) {
          const l = toShow[i] ?? '';
          const p = i === 0 ? `  ${chalk.dim('└ ')}` : '    ';
          lines.push(`${p}${chalk.dim(l.slice(0, 80))}`);
        }
      } else {
        lines.push(`  ${chalk.dim('└ Running...')}`);
      }
    }

    // 2. Streaming assistant text
    if (text) {
      if (lines.length > 0) lines.push('');
      const formatted = formatMarkdown(text);
      if (formatted) {
        const rawLines = formatted.split('\n');
        const wrappedLines: string[] = [];
        for (const fl of rawLines) {
          if (!fl.trim()) {
            wrappedLines.push('');
          } else {
            const wrapped = wrapVisualLine(fl, textWidth);
            for (const wl of wrapped) {
              wrappedLines.push(wl);
            }
          }
        }

        for (let i = 0; i < wrappedLines.length; i++) {
          const l = wrappedLines[i] ?? '';
          if (!l.trim()) {
            lines.push('');
            continue;
          }
          if (i === 0) {
            const bullet = chalk.white(`${figures.blackCircle} `);
            lines.push(`${bullet}${l}`);
          } else {
            lines.push(`  ${l}`);
          }
        }
      }
    }

    return lines;
  }
}
