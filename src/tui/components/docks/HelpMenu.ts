import Component from '../../engine/Component.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk, stripAnsi, truncateToWidth } from '../../utils/format.js';
import stringWidth from 'string-width';

import { box, text, type LayoutNode } from '../../layout/index.js';

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

  override renderLayout(width?: number): LayoutNode {
    const theme = getTheme();
    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(0, termWidth - 1);
    const dividerWidth = Math.max(1, Math.min(termWidth - 4, maxCols));

    const lavHeader = themeColor(theme.lavenderHeader);
    const lavLight = themeColor(theme.lavenderLight);

    const col1 = ['! for bash mode', '/ for commands', '@ for file paths', '/resume for sessions'];
    const col2 = [
      'double tap esc to clear',
      'ctrl + c to cancel / exit',
      'pgup / pgdn to scroll',
      '\\ + enter for newline',
    ];
    const col3 = [
      '/model to change model',
      '/skills to list skills',
      '/clear to clear context',
      '? for shortcuts',
    ];

    const rows: LayoutNode[] = [
      text(lavHeader(figures.horizontalLine.repeat(dividerWidth))),
      text(lavLight('Shortcuts')),
    ];

    for (let i = 0; i < col1.length; i++) {
      const c1 = chalk.dim(col1[i] ?? '');
      const c2 = chalk.dim(col2[i] ?? '');
      const c3 = chalk.dim(col3[i] ?? '');

      rows.push(
        box(
          { direction: 'row', width: '100%', gap: 1, overflow: 'hidden' },
          text(` ${c1}`, { flexGrow: 1, flexShrink: 1, wrappable: false }),
          text(c2, { flexGrow: 1, flexShrink: 1, wrappable: false }),
          text(c3, { flexGrow: 1, flexShrink: 1, wrappable: false }),
        ),
      );
    }

    rows.push(text(chalk.dim.italic('Esc or Enter to dismiss')));

    return box({ direction: 'column', width: '100%', overflow: 'hidden' }, ...rows);
  }

  override render(width?: number): string[] {
    const theme = getTheme();
    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(0, termWidth - 1);
    const dividerWidth = Math.max(1, Math.min(termWidth - 4, maxCols));

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
      '/skills to list skills',
      '/clear to clear context',
      '? for shortcuts',
    ];

    const colWidth = Math.max(1, Math.floor((maxCols - 6) / 3));

    for (let i = 0; i < col1.length; i++) {
      const c1 = chalk.dim(col1[i] ?? '');
      const c2 = chalk.dim(col2[i] ?? '');
      const c3 = chalk.dim(col3[i] ?? '');

      const pad1 = Math.max(1, colWidth - stringWidth(stripAnsi(c1)));
      const pad2 = Math.max(1, colWidth - stringWidth(stripAnsi(c2)));

      const assembled = ` ${c1}${' '.repeat(pad1)}${c2}${' '.repeat(pad2)}${c3}`;
      lines.push(truncateToWidth(assembled, maxCols));
    }

    lines.push(chalk.dim.italic('Esc or Enter to dismiss'));
    return lines.map((l) => truncateToWidth(l, maxCols));
  }
}
