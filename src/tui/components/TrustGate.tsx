import Component from '../engine/Component.js';
import { getTheme, figures } from '../../theme/index.js';
import { themeColor, chalk } from '../utils/format.js';
import { Box, Text, parseKeyInput } from '../primitives/index.js';

export interface TrustGateProps {
  cwd: string;
  onDecision: (trusted: boolean) => void;
}

export interface TrustGateState {
  selectedIndex: number;
}

export default class TrustGate extends Component<TrustGateProps, TrustGateState> {
  override wrap = true;
  override clip = false;

  private removeInputListener: (() => void) | null = null;

  constructor(props: TrustGateProps) {
    super(props);
    this.state = {
      selectedIndex: 1, // Default to option 1 ("2. No, exit")
    };
  }

  override componentDidMount(): void {
    if (!this.engine) return;

    this.removeInputListener = this.engine.addInputListener((chunk) => {
      const action = parseKeyInput(chunk);
      const rawStr = chunk.toString();

      if (action.type === 'cursor-up' || action.type === 'cursor-down') {
        this.setState({
          selectedIndex: this.state.selectedIndex === 0 ? 1 : 0,
        });
        return true;
      }

      if (rawStr === '1') {
        this.setState({ selectedIndex: 0 });
        return true;
      }

      if (rawStr === '2') {
        this.setState({ selectedIndex: 1 });
        return true;
      }

      if (action.type === 'submit') {
        this.props.onDecision(this.state.selectedIndex === 0);
        return true;
      }

      if (action.type === 'escape') {
        this.props.onDecision(false);
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

    const warnColor = themeColor(theme.warning);
    const permColor = themeColor(theme.permission);
    const mutedColor = themeColor(theme.textMuted);
    const dimGuideColor = themeColor(theme.inactive);

    const { selectedIndex } = this.state;
    const isYesSelected = selectedIndex === 0;
    const isNoSelected = selectedIndex === 1;

    const pointer = figures.pointerBold ?? '❯';

    const yesOptionText = isYesSelected
      ? `${permColor(pointer)} ${permColor.bold('1. Yes, I trust this folder')}`
      : `  ${chalk.white('1. Yes, I trust this folder')}`;

    const noOptionText = isNoSelected
      ? `${permColor(pointer)} ${permColor.bold('2. No, exit')}`
      : `  ${chalk.white('2. No, exit')}`;

    const safetyCheckText =
      'You should only proceed if you trust this workspace. Accessing untrusted workspaces may allow malicious code in the repository to compromise security or mislead the assistant.';

    const capabilityText =
      'Steward can read files and execute commands to investigate, build, and debug with your explicit permission. Pre-mutation checkpoints ensure every edit is reversible via /rewind.';

    const element = (
      <Box direction="column" width={maxCols} wrap={true} clip={false}>
        <Text wrap={false} clip={false}>
          {warnColor.bold('Accessing workspace:')}
        </Text>
        <Text wrap={false} clip={false}>
          {''}
        </Text>
        <Text wrap={false} clip={false}>
          {chalk.white.bold(this.props.cwd)}
        </Text>
        <Text wrap={false} clip={false}>
          {''}
        </Text>
        <Text wrap={true}>{chalk.white(safetyCheckText)}</Text>
        <Text wrap={false} clip={false}>
          {''}
        </Text>
        <Text wrap={true}>{chalk.white(capabilityText)}</Text>
        <Text wrap={false} clip={false}>
          {''}
        </Text>
        <Text wrap={false} clip={false}>
          {dimGuideColor('Security guide')}
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
          {mutedColor(chalk.italic('Enter to confirm · Esc to cancel'))}
        </Text>
      </Box>
    );

    return element.render(maxCols);
  }
}
