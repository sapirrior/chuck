import Component from '../../engine/Component.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk } from '../../utils/format.js';
import { Box, Text, parseKeyInput } from '../../primitives/index.js';

export interface BashPermissionDockProps {
  command: string;
  explanation: string;
  onDecision: (allowed: boolean) => void;
}

export type BashPermissionDockMode = 'NORMAL' | 'REVIEW';

export interface BashPermissionDockState {
  mode: BashPermissionDockMode;
  selectedIndex: number; // 0 = Yes, 1 = No
  scrollOffset: number;
}

export default class BashPermissionDock extends Component<
  BashPermissionDockProps,
  BashPermissionDockState
> {
  override wrap = true;
  override clip = false;

  private removeInputListener: (() => void) | null = null;

  constructor(props: BashPermissionDockProps) {
    super(props);
    this.state = {
      mode: 'NORMAL',
      selectedIndex: 0, // Default to Option 1: Yes
      scrollOffset: 0,
    };
  }

  override componentDidMount(): void {
    if (!this.engine) return;

    this.removeInputListener = this.engine.addInputListener((chunk) => {
      const action = parseKeyInput(chunk);
      const rawStr = chunk.toString();

      if (this.state.mode === 'NORMAL') {
        // 'f' enters review mode
        if (rawStr === 'f' || rawStr === 'F') {
          this.setState({ mode: 'REVIEW', scrollOffset: 0 });
          return true;
        }

        // Up / Down toggles selection
        if (action.type === 'cursor-up' || action.type === 'cursor-down') {
          this.setState({
            selectedIndex: this.state.selectedIndex === 0 ? 1 : 0,
          });
          return true;
        }

        // Numeric direct selection
        if (rawStr === '1') {
          this.setState({ selectedIndex: 0 });
          return true;
        }
        if (rawStr === '2') {
          this.setState({ selectedIndex: 1 });
          return true;
        }

        // Submit
        if (action.type === 'submit') {
          this.props.onDecision(this.state.selectedIndex === 0);
          return true;
        }

        // Esc cancels (denies)
        if (action.type === 'escape') {
          this.props.onDecision(false);
          return true;
        }
      } else if (this.state.mode === 'REVIEW') {
        // 'f' or Esc returns to normal permission mode
        if (rawStr === 'f' || rawStr === 'F' || action.type === 'escape') {
          this.setState({ mode: 'NORMAL', scrollOffset: 0 });
          return true;
        }

        // Up / Down scrolls review output
        if (action.type === 'cursor-up') {
          this.setState({
            scrollOffset: Math.max(0, this.state.scrollOffset - 1),
          });
          return true;
        }
        if (action.type === 'cursor-down') {
          const maxScroll = this.getMaxScroll();
          this.setState({
            scrollOffset: Math.min(maxScroll, this.state.scrollOffset + 1),
          });
          return true;
        }
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

  private getMaxScroll(): number {
    const termWidth = process.stdout.columns || 80;
    const cmdText = new Text(this.props.command, { wrap: true, clip: false });
    const renderedCmdLines = cmdText.render(termWidth);
    const maxVisibleReviewLines = 15;
    return Math.max(0, renderedCmdLines.length - maxVisibleReviewLines);
  }

  override render(width?: number): string[] {
    const theme = getTheme();
    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(1, termWidth);

    const dividerColor = themeColor(theme.dividerRule);
    const permColor = themeColor(theme.permission);
    const mutedColor = themeColor(theme.textMuted);
    const { mode, selectedIndex, scrollOffset } = this.state;
    const { command, explanation } = this.props;

    const pointer = figures.pointerBold ?? '❯';
    const isYesSelected = selectedIndex === 0;
    const isNoSelected = selectedIndex === 1;

    // Divider line
    const divider = dividerColor(figures.horizontalLine.repeat(maxCols));

    if (mode === 'REVIEW') {
      // Review mode: displays up to 15 visible scrollable lines of the full command
      const cmdText = new Text(command, { wrap: true, clip: false });
      const renderedCmdLines = cmdText.render(maxCols);

      const maxVisibleReviewLines = 15;
      const totalCmdLines = renderedCmdLines.length;
      const maxScroll = Math.max(0, totalCmdLines - maxVisibleReviewLines);
      const effectiveScroll = Math.min(scrollOffset, maxScroll);

      const visibleCmdLines = renderedCmdLines.slice(
        effectiveScroll,
        effectiveScroll + maxVisibleReviewLines,
      );

      const element = (
        <Box direction="column" width={maxCols} wrap={true} clip={false}>
          <Text wrap={false} clip={true}>
            {divider}
          </Text>
          <Text wrap={false} clip={false}>
            {''}
          </Text>
          <Text wrap={false} clip={false}>
            {chalk.white.bold('Bash command (review)')}
          </Text>
          <Text wrap={false} clip={false}>
            {''}
          </Text>
          {visibleCmdLines.map((line) => (
            <Text wrap={false} clip={false}>
              {`    ${chalk.white(line)}`}
            </Text>
          ))}
          <Text wrap={false} clip={false}>
            {''}
          </Text>
          <Text wrap={false} clip={false}>
            {mutedColor(chalk.italic('↑/↓ scroll · Esc / f to return'))}
          </Text>
        </Box>
      );

      return element.render(maxCols);
    }

    // Normal mode
    const cmdText = new Text(command, { wrap: true, clip: false });
    const renderedCmdLines = cmdText.render(Math.max(10, maxCols - 4));
    const previewLines = renderedCmdLines.slice(0, 3);
    const hiddenCount = Math.max(0, renderedCmdLines.length - 3);

    const yesOptionText = isYesSelected
      ? `${permColor(pointer)} ${permColor.bold('1. Yes')}`
      : `  ${chalk.white('1. Yes')}`;

    const noOptionText = isNoSelected
      ? `${permColor(pointer)} ${permColor.bold('2. No')}`
      : `  ${chalk.white('2. No')}`;

    const element = (
      <Box direction="column" width={maxCols} wrap={true} clip={false}>
        <Text wrap={false} clip={true}>
          {divider}
        </Text>
        <Text wrap={false} clip={false}>
          {''}
        </Text>
        <Text wrap={false} clip={false}>
          {chalk.white.bold('Bash command')}
        </Text>
        <Text wrap={false} clip={false}>
          {''}
        </Text>
        {previewLines.map((line) => (
          <Text wrap={false} clip={false}>
            {`    ${chalk.white(line)}`}
          </Text>
        ))}
        {hiddenCount > 0 && (
          <Text wrap={false} clip={false}>
            {`    ${chalk.dim(`(+${hiddenCount} hidden)`)}`}
          </Text>
        )}
        <Text wrap={false} clip={false}>
          {''}
        </Text>
        <Text wrap={true}>{`    ${chalk.dim(explanation)}`}</Text>
        <Text wrap={false} clip={false}>
          {''}
        </Text>
        <Text wrap={false} clip={false}>
          {chalk.white('Do you want to proceed?')}
        </Text>
        <Text wrap={false} clip={false}>
          {''}
        </Text>
        <Text wrap={false} clip={false}>
          {yesOptionText}
        </Text>
        <Text wrap={false} clip={false}>
          {noOptionText}
        </Text>
        <Text wrap={false} clip={false}>
          {''}
        </Text>
        <Text wrap={false} clip={false}>
          {mutedColor(chalk.italic('Esc to cancel · f to review'))}
        </Text>
      </Box>
    );

    return element.render(maxCols);
  }
}
