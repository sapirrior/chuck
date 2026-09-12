import Component from '../../engine/Component.js';
import type { SessionData } from '../../../session/types.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk } from '../../utils/format.js';
import stringWidth from 'string-width';

export interface SessionMenuProps {
  sessions: SessionData[];
  onSelect: (session: SessionData) => void;
  onCancel: () => void;
}

export interface SessionMenuState {
  selectedIdx: number;
  query: string;
}

export default class SessionMenu extends Component<SessionMenuProps, SessionMenuState> {
  private removeInputListener: (() => void) | null = null;

  constructor(props: SessionMenuProps) {
    super(props);
    this.state = {
      selectedIdx: 0,
      query: '',
    };
  }

  private getFiltered(): SessionData[] {
    const { query } = this.state;
    const { sessions } = this.props;
    if (!query) return sessions;
    const q = query.toLowerCase();
    return sessions.filter((s) => {
      const firstPrompt = s.turns?.[0]?.userPrompt?.toLowerCase() ?? '';
      const name = s.name?.toLowerCase() ?? '';
      const id = s.id?.toLowerCase() ?? '';
      const date = s.date?.toLowerCase() ?? '';
      return id.includes(q) || date.includes(q) || name.includes(q) || firstPrompt.includes(q);
    });
  }

  override componentDidMount(): void {
    if (!this.engine) return;

    this.removeInputListener = this.engine.addInputListener((chunk) => {
      const str = chunk.toString();
      const filtered = this.getFiltered();

      // Escape -> cancel
      if (str === '\x1b') {
        this.props.onCancel();
        return true;
      }

      // Enter -> select
      if (str === '\r' || str === '\n') {
        const chosen = filtered[this.state.selectedIdx];
        if (chosen) {
          this.props.onSelect(chosen);
        }
        return true;
      }

      // Up arrow
      if (str === '\x1b[A') {
        this.setState({
          selectedIdx:
            this.state.selectedIdx > 0 ? this.state.selectedIdx - 1 : filtered.length - 1,
        });
        return true;
      }

      // Down arrow
      if (str === '\x1b[B') {
        this.setState({
          selectedIdx:
            this.state.selectedIdx < filtered.length - 1 ? this.state.selectedIdx + 1 : 0,
        });
        return true;
      }

      // Backspace (\x7f or \x08)
      if (str === '\x7f' || str === '\x08') {
        if (this.state.query.length > 0) {
          this.setState({
            query: this.state.query.slice(0, -1),
            selectedIdx: 0,
          });
        }
        return true;
      }

      // Regular character input
      if (str.length === 1 && str.charCodeAt(0) >= 32) {
        this.setState({
          query: this.state.query + str,
          selectedIdx: 0,
        });
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
    const theme = getTheme();
    const termWidth = width ?? process.stdout.columns ?? 80;
    const dividerWidth = Math.max(10, termWidth - 4);
    const { selectedIdx, query } = this.state;
    const filtered = this.getFiltered();

    const lines: string[] = [];
    const lavHeader = themeColor(theme.lavenderHeader);
    const infoColor = themeColor(theme.info);
    const dashRule = themeColor(theme.dashedRule);

    lines.push(lavHeader(figures.horizontalLine.repeat(dividerWidth)));

    const titleLeft = infoColor('Resume Session');
    const titleRight = chalk.dim(`${filtered.length} session${filtered.length !== 1 ? 's' : ''}`);
    const spCount = Math.max(
      1,
      termWidth - stringWidth('Resume Session') - stringWidth(titleRight) - 4,
    );
    lines.push(`${titleLeft}${' '.repeat(spCount)}${titleRight}`);

    // Search query box
    const pointer = infoColor(`${figures.pointer} `);
    const queryDisplay = query ? chalk.white(query) : chalk.dim('Type to filter sessions…');
    lines.push(`${pointer}${queryDisplay}`);

    lines.push(dashRule(figures.horizontalLine.repeat(dividerWidth)));

    if (filtered.length === 0) {
      lines.push(chalk.dim(`  No saved sessions matching "${query}".`));
    } else {
      const visibleCount = 6;
      const startIdx = Math.max(
        0,
        Math.min(selectedIdx - Math.floor(visibleCount / 2), filtered.length - visibleCount),
      );
      const visibleSessions = filtered.slice(
        Math.max(0, startIdx),
        Math.max(0, startIdx) + visibleCount,
      );

      for (let relativeIdx = 0; relativeIdx < visibleSessions.length; relativeIdx++) {
        const s = visibleSessions[relativeIdx]!;
        const actualIdx = Math.max(0, startIdx) + relativeIdx;
        const isSelected = actualIdx === selectedIdx;
        const shortId = s.id.slice(0, 8);
        const firstMessage = s.name || s.turns?.[0]?.userPrompt || 'Untitled Session';

        const metaInfo = `${s.date} · ${s.turns.length} turns`;
        const maxTitleLen = Math.max(20, termWidth - metaInfo.length - 20);
        const displayTitle =
          firstMessage.length > maxTitleLen
            ? `${firstMessage.slice(0, maxTitleLen - 1)}…`
            : firstMessage;

        const p = isSelected ? infoColor(`${figures.pointer} `) : '  ';
        const titleStr = isSelected ? infoColor(displayTitle) : chalk.dim(displayTitle);
        const leftStr = `${p}${titleStr} ${chalk.dim(`(${shortId})`)}`;
        const rightStr = chalk.dim(metaInfo);

        const pad = Math.max(
          1,
          termWidth - stringWidth(displayTitle) - stringWidth(shortId) - stringWidth(metaInfo) - 10,
        );
        lines.push(`${leftStr}${' '.repeat(pad)}${rightStr}`);
      }
    }

    lines.push(chalk.dim.italic('↑/↓ scroll · Enter to resume · Esc to cancel'));
    return lines;
  }
}
