import Component from '../../engine/Component.js';
import type { ConfirmationDecision, ConfirmationRequest } from '../../../tools/types.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk } from '../../utils/format.js';
import { computeLineDiff, type DiffLine } from '../../../utils/diff.js';

export interface PermissionDockProps {
  request: ConfirmationRequest;
  onDecision: (decision: ConfirmationDecision) => void;
}

export interface PermissionDockState {
  selectedIdx: number;
  isReviewing: boolean;
  reviewOffset: number;
}

export default class PermissionDock extends Component<PermissionDockProps, PermissionDockState> {
  private removeInputListener: (() => void) | null = null;
  private diffLines: DiffLine[] = [];

  constructor(props: PermissionDockProps) {
    super(props);
    this.state = {
      selectedIdx: 0,
      isReviewing: false,
      reviewOffset: 0,
    };

    const isFileOp =
      props.request.toolName === 'edit_file' || props.request.toolName === 'write_file';
    if (isFileOp) {
      const oldContent = (props.request.args as any)?.oldContent ?? '';
      const newContent =
        (props.request.args as any)?.newContent ?? (props.request.args as any)?.content ?? '';
      if (oldContent || newContent) {
        this.diffLines = computeLineDiff(oldContent, newContent);
      }
    }
  }

  override componentDidMount(): void {
    if (!this.engine) return;

    this.removeInputListener = this.engine.addInputListener((chunk) => {
      const str = chunk.toString();
      const options: Array<{ decision: ConfirmationDecision }> = [
        { decision: 'allow_once' },
        { decision: 'allow_session' },
        { decision: 'deny' },
      ];

      // Escape -> deny or exit review
      if (str === '\x1b') {
        if (this.state.isReviewing) {
          this.setState({ isReviewing: false });
        } else {
          this.props.onDecision('deny');
        }
        return true;
      }

      // 'f' toggles review mode
      const hasReviewableContent =
        this.diffLines.length > 0 ||
        (this.props.request.toolName === 'run_command' &&
          ((this.props.request.args as any)?.command ?? '').split('\n').length > 5);

      if (str.toLowerCase() === 'f' && hasReviewableContent) {
        this.setState({ isReviewing: !this.state.isReviewing });
        return true;
      }

      if (this.state.isReviewing) {
        const totalItems =
          this.diffLines.length > 0
            ? this.diffLines.length
            : ((this.props.request.args as any)?.command ?? '').split('\n').length;

        if (str === '\x1b[A') {
          // Up arrow
          this.setState({ reviewOffset: Math.max(0, this.state.reviewOffset - 1) });
          return true;
        }
        if (str === '\x1b[B') {
          // Down arrow
          this.setState({
            reviewOffset: Math.min(Math.max(0, totalItems - 1), this.state.reviewOffset + 1),
          });
          return true;
        }
      }

      // Number keys & shortcuts
      if (str === '1' || str.toLowerCase() === 'y') {
        this.props.onDecision('allow_once');
        return true;
      }
      if (str === '2' || str.toLowerCase() === 'a') {
        this.props.onDecision('allow_session');
        return true;
      }
      if (str === '3' || str.toLowerCase() === 'n') {
        this.props.onDecision('deny');
        return true;
      }

      // Arrow navigation
      if (str === '\x1b[A') {
        this.setState({
          selectedIdx: this.state.selectedIdx > 0 ? this.state.selectedIdx - 1 : options.length - 1,
        });
        return true;
      }
      if (str === '\x1b[B') {
        this.setState({
          selectedIdx: this.state.selectedIdx < options.length - 1 ? this.state.selectedIdx + 1 : 0,
        });
        return true;
      }

      // Enter
      if (str === '\r' || str === '\n') {
        const selected = options[this.state.selectedIdx];
        if (selected) {
          this.props.onDecision(selected.decision);
        }
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
    const { request } = this.props;
    const { selectedIdx, isReviewing, reviewOffset } = this.state;

    const lines: string[] = [];
    const lavHeader = themeColor(theme.lavenderHeader);
    const lavLight = themeColor(theme.lavenderLight);
    const dashRule = themeColor(theme.dashedRule);

    lines.push(lavHeader(figures.horizontalLine.repeat(dividerWidth)));
    lines.push(lavLight(`Permission Required: ${request.displayName}`));

    // Diff preview for file ops
    if (this.diffLines.length > 0) {
      lines.push(dashRule(figures.horizontalLine.repeat(dividerWidth)));
      const maxPreview = 8;
      const reviewWindowSize = 10;
      let visibleLines: DiffLine[] = [];

      if (isReviewing) {
        const start = Math.max(
          0,
          Math.min(reviewOffset, Math.max(0, this.diffLines.length - reviewWindowSize)),
        );
        visibleLines = this.diffLines.slice(start, start + reviewWindowSize);
      } else {
        visibleLines = this.diffLines.slice(0, maxPreview);
      }

      for (let idx = 0; idx < visibleLines.length; idx++) {
        const line = visibleLines[idx]!;
        const actualIdx = isReviewing
          ? Math.max(
              0,
              Math.min(reviewOffset, Math.max(0, this.diffLines.length - reviewWindowSize)),
            ) + idx
          : idx;
        const isCursorLine = isReviewing && actualIdx === reviewOffset;
        const lineNum = line.lineNumber ? `${line.lineNumber}`.padStart(3) : '   ';

        let lineText = line.text;
        if (line.kind === 'add') {
          lineText = chalk.green(line.text);
        } else if (line.kind === 'delete') {
          lineText = chalk.red(line.text);
        } else if (line.kind === 'hunk') {
          lineText = chalk.cyan.bold(line.text);
        }

        const cursorStr = isCursorLine ? lavLight('> ') : '  ';
        if (line.kind === 'hunk') {
          lines.push(`${cursorStr}   ${lineText}`);
        } else {
          lines.push(`${cursorStr}${chalk.dim(`${lineNum} ${line.prefix} `)}${lineText}`);
        }
      }

      if (!isReviewing && this.diffLines.length > maxPreview) {
        lines.push(
          chalk.dim(
            `  ... (${this.diffLines.length - maxPreview} more lines, press 'f' to review)`,
          ),
        );
      }
      lines.push(dashRule(figures.horizontalLine.repeat(dividerWidth)));
    } else if (request.toolName === 'run_command' && (request.args as any)?.command) {
      lines.push(dashRule(figures.horizontalLine.repeat(dividerWidth)));
      const pink = themeColor(theme.bashPink);
      const cmdRaw: string = (request.args as any).command;
      const cmdLines = cmdRaw.split('\n');
      const maxPreview = 5;
      const reviewWindowSize = 10;

      let visibleCmdLines: string[] = [];
      if (isReviewing) {
        const start = Math.max(
          0,
          Math.min(reviewOffset, Math.max(0, cmdLines.length - reviewWindowSize)),
        );
        visibleCmdLines = cmdLines.slice(start, start + reviewWindowSize);
      } else {
        visibleCmdLines = cmdLines.slice(0, maxPreview);
      }

      for (let i = 0; i < visibleCmdLines.length; i++) {
        const cl = visibleCmdLines[i] ?? '';
        const p = i === 0 ? pink('$ ') : '  ';
        lines.push(`  ${p}${chalk.white(cl)}`);
      }

      if (!isReviewing && cmdLines.length > maxPreview) {
        lines.push(
          chalk.dim(`  ... (${cmdLines.length - maxPreview} more lines, press 'f' to review)`),
        );
      }
      lines.push(dashRule(figures.horizontalLine.repeat(dividerWidth)));
    } else if (request.promptTitle) {
      lines.push(chalk.dim(`  ${request.promptTitle}`));
    }

    const options = [
      { key: '1', label: 'Yes', decision: 'allow_once' },
      { key: '2', label: 'Yes, allow for session', decision: 'allow_session' },
      { key: '3', label: 'No', decision: 'deny' },
    ];

    for (let i = 0; i < options.length; i++) {
      const opt = options[i]!;
      const isSelected = i === selectedIdx;
      const pointer = isSelected ? themeColor(theme.info)(`${figures.pointer} `) : '  ';
      const label = isSelected
        ? themeColor(theme.info)(`${opt.key}. ${opt.label}`)
        : chalk.dim(`${opt.key}. ${opt.label}`);
      lines.push(`${pointer}${label}`);
    }

    lines.push(
      chalk.dim.italic('1/2/3 or y/a/n to choose · ↑/↓ navigate · Enter select · Esc deny'),
    );
    return lines;
  }
}
