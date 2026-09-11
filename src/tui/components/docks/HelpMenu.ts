import Component from '../../engine/Component.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk } from '../../utils/format.js';
import stringWidth from 'string-width';

export interface HelpMenuProps {
  onClose: () => void;
}

export default class HelpMenu extends Component<HelpMenuProps> {
  private removeInputListener: (() => void) | null = null;

  override componentDidMount(): void {
    if (!this.engine) return;

    this.removeInputListener = this.engine.addInputListener((chunk) => {
      const str = chunk.toString();
      if (str === '\x1b' || str === '\r' || str === '\n') {
        this.props.onClose();
        return true;
      }
      return false;
    });
  }

  override componentWillUnmount(): void {
    if (this.removeInputListener) {
      this.removeInputListener();
      this.removeInputListener = null;
    }
  }

  override render(): string[] {
    const theme = getTheme();
    const termWidth = process.stdout.columns || 80;
    const dividerWidth = Math.max(10, termWidth - 4);

    const lines: string[] = [];
    const lavHeader = themeColor(theme.lavenderHeader);
    const lavLight = themeColor(theme.lavenderLight);

    lines.push(lavHeader(figures.horizontalLine.repeat(dividerWidth)));
    lines.push(lavLight('Shortcuts'));

    const col1 = ['! for bash mode', '/ for commands', '@ for file paths', '/resume for sessions'];

    const col2 = [
      'double tap esc to clear',
      'ctrl + c to cancel / exit',
      'pgup / pgdn to scroll',
      '\\ + enter for newline',
    ];

    const col3 = [
      '/model to change model',
      '/clear to clear context',
      '/new to start new session',
      '? for shortcuts',
    ];

    const colWidth = Math.floor((termWidth - 6) / 3);

    for (let i = 0; i < col1.length; i++) {
      const c1 = chalk.dim(col1[i] ?? '');
      const c2 = chalk.dim(col2[i] ?? '');
      const c3 = chalk.dim(col3[i] ?? '');

      const pad1 = Math.max(1, colWidth - stringWidth(col1[i] ?? ''));
      const pad2 = Math.max(1, colWidth - stringWidth(col2[i] ?? ''));

      lines.push(` ${c1}${' '.repeat(pad1)}${c2}${' '.repeat(pad2)}${c3}`);
    }

    lines.push(chalk.dim.italic('Esc or Enter to dismiss'));
    return lines;
  }
}
