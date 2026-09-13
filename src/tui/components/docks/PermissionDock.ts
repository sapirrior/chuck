import stringWidth from 'string-width';
import Component from '../../engine/Component.js';
import type { ConfirmationDecision, ConfirmationRequest } from '../../../tools/types.js';
import { reviewTokenCache } from '../../../tools/review-cache.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, themeBgColor, chalk } from '../../utils/format.js';
import { computeLineDiff, type DiffLine } from '../../../utils/diff.js';
import { Box, type BoxElement } from '../../primitives/Box.js';
import { Text, type TextElement } from '../../primitives/Text.js';
import { parseKeyInput } from '../../primitives/widgets/KeyReader.js';

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
  override overflow = 'hidden' as const;
  override truncation = 'clip' as const;

  private removeInputListener: (() => void) | null = null;
  private diffLines: DiffLine[] = [];
  private targetFile = '';
  private fullLoaded = false;

  constructor(props: PermissionDockProps) {
    super(props);
    this.state = {
      selectedIdx: 0,
      isReviewing: false,
      reviewOffset: 0,
    };

    const preview = props.request.preview;
    if (preview) {
      if (preview.kind === 'edit') {
        this.targetFile = preview.path;
        this.diffLines = preview.smallPreviewDiffLines ? [...preview.smallPreviewDiffLines] : [];
      } else if (preview.kind === 'write') {
        this.targetFile = preview.path;
        this.diffLines = (preview.smallPreviewLines ?? []).map((l, i) => ({
          kind: 'neutral' as const,
          prefix: ' ',
          lineNumber: i + 1,
          text: l,
        }));
      }
    } else {
      // Fallback for untyped legacy requests
      const isEditOp = props.request.toolName === 'edit_file';
      const isWriteOp = props.request.toolName === 'write_file';
      this.targetFile =
        (props.request.args as any)?.path ??
        (props.request.args as any)?.file_path ??
        (props.request.args as any)?.target_file ??
        '';

      if (isEditOp) {
        const oldContent = (props.request.args as any)?.oldContent ?? '';
        const newContent =
          (props.request.args as any)?.newContent ?? (props.request.args as any)?.content ?? '';
        if (oldContent || newContent) {
          this.diffLines = computeLineDiff(oldContent, newContent);
        }
      } else if (isWriteOp) {
        const content = (props.request.args as any)?.content ?? '';
        if (content) {
          const lines = String(content).split(/\r?\n/);
          this.diffLines = lines.map((l, i) => ({
            kind: 'neutral' as const,
            prefix: ' ',
            lineNumber: i + 1,
            text: l,
          }));
        }
      }
    }
  }

  private loadFullReviewContent(): void {
    if (this.fullLoaded) return;
    this.fullLoaded = true;

    const token = this.props.request.reviewToken;
    if (!token) return;

    const entry = reviewTokenCache.get(token);
    if (!entry) return;

    if (entry.oldContent !== undefined && entry.newContent !== undefined) {
      this.diffLines = computeLineDiff(entry.oldContent, entry.newContent, 3);
    } else if (entry.fullText !== undefined) {
      this.diffLines = entry.fullText.split(/\r?\n/).map((l, i) => ({
        kind: 'neutral' as const,
        prefix: ' ',
        lineNumber: i + 1,
        text: l,
      }));
    }
  }

  override componentDidMount(): void {
    if (!this.engine) return;

    this.removeInputListener = this.engine.addInputListener((chunk) => {
      const action = parseKeyInput(chunk);
      const str = action.raw;
      const options: Array<{ decision: ConfirmationDecision }> = [
        { decision: 'allow_once' },
        { decision: 'allow_session' },
        { decision: 'deny' },
      ];

      // Escape -> deny or exit review
      if (action.type === 'escape') {
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
        Boolean(this.props.request.reviewToken) ||
        (this.props.request.preview?.kind === 'command' &&
          this.props.request.preview.command.split('\n').length > 5) ||
        (this.props.request.toolName === 'run_command' &&
          ((this.props.request.args as any)?.command ?? '').split('\n').length > 5);

      if (str.toLowerCase() === 'f' && hasReviewableContent) {
        const nextReviewing = !this.state.isReviewing;
        if (nextReviewing) {
          this.loadFullReviewContent();
        }
        this.setState({ isReviewing: nextReviewing });
        return true;
      }

      // Scrolling within review mode
      if (this.state.isReviewing) {
        let totalItems = this.diffLines.length;
        if (this.props.request.preview?.kind === 'command') {
          totalItems = this.props.request.preview.command.split('\n').length;
        } else if ((this.props.request.args as any)?.command) {
          totalItems = ((this.props.request.args as any).command as string).split('\n').length;
        }

        if (action.type === 'cursor-up') {
          this.setState({ reviewOffset: Math.max(0, this.state.reviewOffset - 1) });
          return true;
        }
        if (action.type === 'cursor-down') {
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
      if (action.type === 'cursor-up') {
        this.setState({
          selectedIdx: this.state.selectedIdx > 0 ? this.state.selectedIdx - 1 : options.length - 1,
        });
        return true;
      }
      if (action.type === 'cursor-down') {
        this.setState({
          selectedIdx: this.state.selectedIdx < options.length - 1 ? this.state.selectedIdx + 1 : 0,
        });
        return true;
      }

      // Enter
      if (action.type === 'submit') {
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

  override render(width?: number): string[] {
    const theme = getTheme();
    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(1, termWidth);
    const dividerWidth = maxCols;
    const { request } = this.props;
    const { selectedIdx, isReviewing, reviewOffset } = this.state;

    const elements: (BoxElement | TextElement | string)[] = [];
    const dashRule = themeColor(theme.dashedRule);
    const cyan = themeColor(theme.info);
    const addBg = themeBgColor(theme.diffAddBG);
    const addFg = themeColor(theme.diffAddFG);
    const delBg = themeBgColor(theme.diffDeleteBG);
    const delFg = themeColor(theme.diffDeleteFG);

    // Title / Header
    const actionTitle =
      request.toolName === 'edit_file'
        ? 'Edit file'
        : request.toolName === 'write_file'
          ? 'Write file'
          : `Execute ${request.displayName}`;
    elements.push(
      Text(cyan(actionTitle), {
        bold: true,
        overflow: 'hidden',
        truncation: 'clip',
      }),
    );
    if (this.targetFile) {
      elements.push(Text(chalk.dim(this.targetFile)));
    }

    // Diff preview for file ops
    if (this.diffLines.length > 0) {
      elements.push(Text(dashRule(figures.horizontalLine.repeat(dividerWidth))));
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
        const lineNum = line.lineNumber ? `${line.lineNumber}`.padStart(3) : '   ';

        if (line.kind === 'add') {
          const content = `${lineNum} +${line.text}`;
          const pad = Math.max(0, maxCols - stringWidth(content));
          elements.push(Text(addBg(`${addFg(content)}${' '.repeat(pad)}`)));
        } else if (line.kind === 'delete') {
          const content = `${lineNum} -${line.text}`;
          const pad = Math.max(0, maxCols - stringWidth(content));
          elements.push(Text(delBg(`${delFg(content)}${' '.repeat(pad)}`)));
        } else if (line.kind === 'hunk') {
          elements.push(Text(chalk.cyan.bold(`    ${line.text}`)));
        } else {
          elements.push(Text(`${chalk.dim(`${lineNum}  `)}${chalk.white(line.text)}`));
        }
      }
      elements.push(Text(dashRule(figures.horizontalLine.repeat(dividerWidth))));
    } else if (
      request.preview?.kind === 'command' ||
      (request.toolName === 'run_command' && (request.args as any)?.command)
    ) {
      elements.push(Text(dashRule(figures.horizontalLine.repeat(dividerWidth))));
      const pink = themeColor(theme.bashPink);
      const cmdRaw: string =
        request.preview?.kind === 'command'
          ? request.preview.command
          : (request.args as any).command;
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
        elements.push(Text(`  ${p}${chalk.white(cl)}`));
      }

      if (!isReviewing && cmdLines.length > maxPreview) {
        elements.push(
          Text(
            chalk.dim(`  ... (${cmdLines.length - maxPreview} more lines, press 'f' to review)`),
          ),
        );
      }
      elements.push(Text(dashRule(figures.horizontalLine.repeat(dividerWidth))));
    }

    // Question Prompt
    const promptQ = this.targetFile
      ? `Do you want to make this edit to ${this.targetFile}?`
      : `Do you want to execute ${request.displayName}?`;
    elements.push(Text(chalk.white(promptQ)));

    const options = [
      { key: '1', label: 'Yes', decision: 'allow_once' },
      { key: '2', label: 'Yes, allow for this session', decision: 'allow_session' },
      { key: '3', label: 'No', decision: 'deny' },
    ];

    for (let i = 0; i < options.length; i++) {
      const opt = options[i]!;
      const isSelected = i === selectedIdx;
      const pointer = isSelected ? themeColor(theme.info)(`${figures.pointerBold} `) : '  ';
      const label = isSelected
        ? themeColor(theme.info)(`${opt.key}. ${opt.label}`)
        : chalk.dim(`${opt.key}. ${opt.label}`);
      elements.push(Text(`${pointer}${label}`));
    }

    elements.push(Text(chalk.dim('Esc to cancel · Tab to amend · 1/2/3 to choose')));

    const box = Box(
      {
        border: 'top-bottom',
        borderColor: theme.info,
        width: maxCols,
        overflow: 'hidden',
        truncation: 'clip',
      },
      elements,
    );

    return box.render(maxCols);
  }
}
