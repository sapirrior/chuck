import Component from '../engine/Component.js';
import { getTheme, figures } from '../../theme/index.js';
import { themeColor, chalk, formatMarkdown } from '../utils/format.js';
import { wrapVisualLine } from '../engine/cell-layout.js';

export interface StreamingViewState {
  reasoning: string;
  text: string;
  isStreaming: boolean;
}

export default class StreamingView extends Component<{}, StreamingViewState> {
  constructor() {
    super({});
    this.state = {
      reasoning: '',
      text: '',
      isStreaming: false,
    };
  }

  setStream(reasoning: string, text: string, isStreaming: boolean): void {
    this.setState({ reasoning, text, isStreaming });
  }

  reset(): void {
    this.setState({ reasoning: '', text: '', isStreaming: false });
  }

  override render(): string[] {
    const { reasoning, text, isStreaming } = this.state;
    if (!isStreaming && !reasoning && !text) return [];

    const lines: string[] = [];
    const theme = getTheme();

    if (reasoning) {
      const ast = chalk.dim.italic(`${figures.teardropAsterisk} ${reasoning}`);
      const rLines = ast.split('\n');
      for (const rl of rLines) {
        lines.push(`    ${rl}`);
      }
    }

    if (text) {
      if (reasoning) lines.push('');
      const formatted = formatMarkdown(text);
      if (formatted) {
        const rawLines = formatted.split('\n');
        const wrappedLines: string[] = [];
        for (const fl of rawLines) {
          if (!fl.trim()) {
            wrappedLines.push('');
          } else {
            const wrapped = wrapVisualLine(fl, 96);
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
            lines.push(`  ${bullet}${l}`);
          } else {
            lines.push(`    ${l}`);
          }
        }
      }
    }

    return lines;
  }
}
