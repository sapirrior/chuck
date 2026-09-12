import Component from '../../engine/Component.js';
import { Box, Text, renderModalBox } from '../../primitives/index.js';

export interface HelpMenuProps {
  onClose: () => void;
}

export default class HelpMenu extends Component<HelpMenuProps> {
  override overflow = 'hidden' as const;
  override truncation = 'clip' as const;

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

  override render(width?: number): string[] {
    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(1, termWidth - 1);

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

    const rows = col1.map((_, i) =>
      Box({ direction: 'row', gap: 2, width: maxCols }, [
        Text(` ${col1[i] ?? ''}`, { dim: true }),
        Text(col2[i] ?? '', { dim: true }),
        Text(col3[i] ?? '', { dim: true }),
      ]),
    );

    return renderModalBox({
      title: 'Shortcuts',
      content: rows,
      footer: 'Esc or Enter to dismiss',
      width: termWidth,
    });
  }
}
