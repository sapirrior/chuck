import Component from '../engine/Component.js';
import { figures } from '../../theme/index.js';
import {
  chalk,
  formatMarkdown,
  getStatusBullet,
  truncateMiddle,
  extractPrimaryToolParam,
} from '../utils/format.js';
import { wrapVisualLine } from '../engine/cell-layout.js';

export interface ActiveToolCall {
  id: string;
  name: string;
  displayName?: string;
  args?: Record<string, unknown>;
  startTime: number;
  recentLines?: string[];
}

export interface StreamingViewState {
  text: string;
  isStreaming: boolean;
  isThinking: boolean;
  thinkingStartTime?: number;
  activeTool?: ActiveToolCall | null;
  pulseFrame: number;
}

export default class StreamingView extends Component<{}, StreamingViewState> {
  override wrap = true;
  override clip = false;
  private pulseTimer: NodeJS.Timeout | null = null;

  constructor() {
    super({});
    this.state = {
      text: '',
      isStreaming: false,
      isThinking: false,
      activeTool: null,
      pulseFrame: 0,
    };
  }

  setThinking(isThinking: boolean): void {
    if (isThinking) {
      this.setState({
        isThinking: true,
        thinkingStartTime: this.state.isThinking ? this.state.thinkingStartTime : performance.now(),
      });
      this.ensurePulse();
    } else {
      this.setState({ isThinking: false, thinkingStartTime: undefined });
      this.ensurePulse();
    }
  }

  setStream(text: string, isStreaming: boolean): void {
    this.setState({
      text,
      isStreaming,
      isThinking: isStreaming && text.length > 0 ? false : this.state.isThinking,
    });
    this.ensurePulse();
  }

  setActiveTool(tool: ActiveToolCall | null): void {
    this.setState({
      activeTool: tool,
      isThinking: tool !== null ? false : this.state.isThinking,
    });
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
    const isBusy = this.state.isStreaming || this.state.activeTool || this.state.isThinking;
    if (isBusy && !this.pulseTimer) {
      this.pulseTimer = setInterval(() => {
        this.setState({ pulseFrame: this.state.pulseFrame + 1 });
      }, 120);
    } else if (!isBusy && this.pulseTimer) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
  }

  reset(): void {
    if (this.pulseTimer) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
    this.setState({
      text: '',
      isStreaming: false,
      isThinking: false,
      thinkingStartTime: undefined,
      activeTool: null,
      pulseFrame: 0,
    });
  }

  override componentWillUnmount(): void {
    if (this.pulseTimer) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
  }

  override render(width?: number): string[] {
    const { text, isStreaming, isThinking, thinkingStartTime, activeTool, pulseFrame } = this.state;
    if (!isStreaming && !text && !activeTool && !isThinking) return [];

    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(1, termWidth);
    const textWidth = Math.max(1, maxCols - 2);

    const lines: string[] = [];

    // 1. Ongoing active tool call (streaming live output)
    if (activeTool) {
      const bullet = getStatusBullet('running', pulseFrame % 2 === 0);
      const toolName =
        activeTool.displayName ??
        (activeTool.name
          ? activeTool.name.charAt(0).toUpperCase() + activeTool.name.slice(1)
          : 'Tool');

      const targetArg = extractPrimaryToolParam(activeTool.args);

      let line = `${bullet} ${toolName}`;
      if (targetArg) {
        const maxArgLen = Math.max(10, maxCols - toolName.length - 8);
        const truncatedArg =
          targetArg.length > maxArgLen ? truncateMiddle(targetArg, maxArgLen) : targetArg;
        line += `${chalk.dim('(')}${chalk.dim(truncatedArg)}${chalk.dim(')')}`;
      } else {
        line += `${chalk.dim('()')}`;
      }
      lines.push(line);

      if (activeTool.recentLines && activeTool.recentLines.length > 0) {
        const toShow = activeTool.recentLines.slice(-10);
        const maxLogLen = Math.max(10, maxCols - 6);
        for (let i = 0; i < toShow.length; i++) {
          const l = toShow[i] ?? '';
          const p = i === 0 ? `  ${chalk.dim('└ ')}` : '    ';
          const truncatedLog = l.length > maxLogLen ? `${l.slice(0, maxLogLen - 1)}…` : l;
          lines.push(`${p}${chalk.dim(truncatedLog)}`);
        }
      } else {
        lines.push(`  ${chalk.dim('└ Running...')}`);
      }
    } else if (isThinking && !text) {
      // 2. Animated Thinking indicator styled like a tool call
      const bullet = getStatusBullet('running', pulseFrame % 2 === 0);
      lines.push(`${bullet} ${chalk.bold('Thinking..')}`);

      const elapsedMs = thinkingStartTime
        ? performance.now() - thinkingStartTime
        : pulseFrame * 120;

      let subText = 'wait...';
      if (elapsedMs < 2000) {
        subText = pulseFrame % 16 < 8 ? 'hmm..' : 'wait...';
      } else if (elapsedMs < 4500) {
        subText = pulseFrame % 16 < 8 ? 'analyzing...' : 'thinking...';
      } else if (elapsedMs < 8000) {
        subText = 'still thinking...';
      } else {
        subText = 'taking a bit time...';
      }

      lines.push(`  ${chalk.dim('└ ')}${chalk.dim(subText)}`);
    }

    // 3. Streaming assistant text
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
