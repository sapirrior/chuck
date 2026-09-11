import Component from '../engine/Component.js';
import { defaultCommandRegistry } from '../../commands/registry.js';
import type { SlashCommand } from '../../commands/types.js';
import { searchWorkspaceFiles } from '../../utils/file-search.js';
import { getTheme, figures } from '../../theme/index.js';
import { themeColor, chalk } from '../utils/format.js';
import stringWidth from 'string-width';

export interface PromptInputProps {
  onSubmit: (text: string, isBash?: boolean) => void;
  onAbort?: () => void;
  onToggleHelp?: () => void;
  cwd?: string;
  initialHistory?: string[];
}

export interface PromptInputState {
  value: string;
  cursorPos: number;
  disabled: boolean;
  historyIndex: number;
  escPending: boolean;
  spinnerFrame: number;
  fileMatches: string[];
  fileSelectIdx: number;
  paletteIdx: number;
}

const STATUS_WORDS = [
  'thinking…',
  'analyzing…',
  'exploring…',
  'computing…',
  'crafting…',
  'generating…',
];

export default class PromptInput extends Component<PromptInputProps, PromptInputState> {
  private history: string[] = [];
  private draft = '';
  private removeInputListener: (() => void) | null = null;
  private spinnerTimer: NodeJS.Timeout | null = null;
  private escTimer: NodeJS.Timeout | null = null;

  constructor(props: PromptInputProps) {
    super(props);
    this.history = [...(props.initialHistory ?? [])];
    this.state = {
      value: '',
      cursorPos: 0,
      disabled: false,
      historyIndex: -1,
      escPending: false,
      spinnerFrame: 0,
      fileMatches: [],
      fileSelectIdx: 0,
      paletteIdx: 0,
    };
  }

  setDisabled(disabled: boolean): void {
    if (this.state.disabled === disabled) return;
    this.setState({ disabled });

    if (disabled) {
      if (!this.spinnerTimer) {
        this.spinnerTimer = setInterval(() => {
          this.setState({ spinnerFrame: this.state.spinnerFrame + 1 });
        }, 80);
      }
    } else {
      if (this.spinnerTimer) {
        clearInterval(this.spinnerTimer);
        this.spinnerTimer = null;
      }
    }
  }

  addHistory(item: string): void {
    if (!item.trim()) return;
    if (this.history.length === 0 || this.history[this.history.length - 1] !== item) {
      this.history.push(item);
    }
    this.setState({ historyIndex: -1 });
    this.draft = '';
  }

  override componentDidMount(): void {
    if (!this.engine) return;

    this.removeInputListener = this.engine.addInputListener((chunk) => {
      const str = chunk.toString();

      // 1. If currently generating (disabled), Escape stops generation immediately
      if (this.state.disabled) {
        if (str === '\x1b') {
          this.props.onAbort?.();
          return true;
        }
        return false;
      }

      // 2. Escape: dismiss popovers or double-press to clear
      if (str === '\x1b') {
        if (this.state.fileMatches.length > 0) {
          this.setState({ fileMatches: [] });
          return true;
        }
        if (this.state.value.length > 0) {
          if (this.state.escPending) {
            if (this.escTimer) clearTimeout(this.escTimer);
            this.escTimer = null;
            this.setState({ value: '', cursorPos: 0, historyIndex: -1, escPending: false });
          } else {
            this.setState({ escPending: true });
            if (this.escTimer) clearTimeout(this.escTimer);
            this.escTimer = setTimeout(() => {
              this.setState({ escPending: false });
            }, 600);
          }
          return true;
        }
        return false;
      }

      // 3. Question mark '?' when prompt is empty opens Help Dock
      if (str === '?' && this.state.value.length === 0) {
        this.props.onToggleHelp?.();
        return true;
      }

      const isSlashMode = this.state.value.startsWith('/') && !this.state.value.includes(' ');
      const matchingCommands = isSlashMode
        ? defaultCommandRegistry
            .getAll()
            .filter((c) => `/${c.name}`.toLowerCase().startsWith(this.state.value.toLowerCase()))
        : [];

      // 4. Return (Submit or multiline with \)
      if (str === '\r' || str === '\n') {
        // File selection
        if (this.state.fileMatches.length > 0) {
          const atData = this.getAtData();
          if (atData) {
            const chosen = this.state.fileMatches[this.state.fileSelectIdx];
            if (chosen) {
              const before = this.state.value.slice(0, atData.atIndex);
              const after = this.state.value.slice(this.state.cursorPos);
              const inserted = `${before}@${chosen} ${after}`;
              this.setState({
                value: inserted,
                cursorPos: atData.atIndex + 1 + chosen.length + 1,
                fileMatches: [],
              });
              return true;
            }
          }
        }

        // Slash command execution
        if (isSlashMode && matchingCommands.length > 0) {
          const chosen = matchingCommands[this.state.paletteIdx] ?? matchingCommands[0];
          if (chosen) {
            const cmdText = `/${chosen.name}`;
            this.addHistory(cmdText);
            this.setState({ value: '', cursorPos: 0, fileMatches: [] });
            this.props.onSubmit(cmdText);
            return true;
          }
        }

        // Multiline insertion with \ + Enter
        if (this.state.cursorPos > 0 && this.state.value[this.state.cursorPos - 1] === '\\') {
          const before = this.state.value.slice(0, this.state.cursorPos - 1);
          const after = this.state.value.slice(this.state.cursorPos);
          this.setState({
            value: `${before}\n${after}`,
            cursorPos: this.state.cursorPos,
          });
          return true;
        }

        const trimmed = this.state.value.trim();
        if (trimmed) {
          const isBash = trimmed.startsWith('!');
          this.addHistory(trimmed);
          this.setState({ value: '', cursorPos: 0, fileMatches: [] });
          if (isBash) {
            this.props.onSubmit(trimmed.slice(1).trim(), true);
          } else {
            this.props.onSubmit(trimmed, false);
          }
        }
        return true;
      }

      // 5. Tab Completion
      if (str === '\t') {
        if (this.state.fileMatches.length > 0) {
          const atData = this.getAtData();
          if (atData) {
            const chosen = this.state.fileMatches[this.state.fileSelectIdx];
            if (chosen) {
              const before = this.state.value.slice(0, atData.atIndex);
              const after = this.state.value.slice(this.state.cursorPos);
              const inserted = `${before}@${chosen} ${after}`;
              this.setState({
                value: inserted,
                cursorPos: atData.atIndex + 1 + chosen.length + 1,
                fileMatches: [],
              });
              return true;
            }
          }
        }

        if (isSlashMode && matchingCommands.length > 0) {
          const chosen = matchingCommands[this.state.paletteIdx] ?? matchingCommands[0];
          if (chosen) {
            const completed = `/${chosen.name} `;
            this.setState({
              value: completed,
              cursorPos: completed.length,
            });
            return true;
          }
        }
        return true;
      }

      // 6. Arrow Up
      if (str === '\x1b[A') {
        if (this.state.fileMatches.length > 0) {
          this.setState({
            fileSelectIdx:
              this.state.fileSelectIdx > 0
                ? this.state.fileSelectIdx - 1
                : this.state.fileMatches.length - 1,
          });
          return true;
        }
        if (isSlashMode && matchingCommands.length > 0) {
          this.setState({
            paletteIdx:
              this.state.paletteIdx > 0 ? this.state.paletteIdx - 1 : matchingCommands.length - 1,
          });
          return true;
        }

        // History traversal (Up = older)
        if (this.history.length > 0) {
          if (this.state.historyIndex === -1) {
            this.draft = this.state.value;
          }
          const nextIndex =
            this.state.historyIndex === -1
              ? this.history.length - 1
              : Math.max(0, this.state.historyIndex - 1);
          const historical = this.history[nextIndex] ?? '';
          this.setState({
            historyIndex: nextIndex,
            value: historical,
            cursorPos: historical.length,
          });
        }
        return true;
      }

      // 7. Arrow Down
      if (str === '\x1b[B') {
        if (this.state.fileMatches.length > 0) {
          this.setState({
            fileSelectIdx:
              this.state.fileSelectIdx < this.state.fileMatches.length - 1
                ? this.state.fileSelectIdx + 1
                : 0,
          });
          return true;
        }
        if (isSlashMode && matchingCommands.length > 0) {
          this.setState({
            paletteIdx:
              this.state.paletteIdx < matchingCommands.length - 1 ? this.state.paletteIdx + 1 : 0,
          });
          return true;
        }

        // History traversal (Down = newer)
        if (this.state.historyIndex !== -1) {
          const nextIndex = this.state.historyIndex + 1;
          if (nextIndex >= this.history.length) {
            this.setState({
              historyIndex: -1,
              value: this.draft,
              cursorPos: this.draft.length,
            });
            this.draft = '';
          } else {
            const historical = this.history[nextIndex] ?? '';
            this.setState({
              historyIndex: nextIndex,
              value: historical,
              cursorPos: historical.length,
            });
          }
        }
        return true;
      }

      // 8. Backspace
      if (str === '\x7f' || str === '\x08') {
        if (this.state.cursorPos > 0) {
          const before = this.state.value.slice(0, this.state.cursorPos - 1);
          const after = this.state.value.slice(this.state.cursorPos);
          const nextVal = before + after;
          const nextPos = this.state.cursorPos - 1;
          this.updateValueAndCheckCompletions(nextVal, nextPos);
        }
        return true;
      }

      // 9. Arrow Left / Right
      if (str === '\x1b[D') {
        this.setState({ cursorPos: Math.max(0, this.state.cursorPos - 1) });
        return true;
      }
      if (str === '\x1b[C') {
        this.setState({ cursorPos: Math.min(this.state.value.length, this.state.cursorPos + 1) });
        return true;
      }

      // 10. Home / End
      if (str === '\x1b[H' || str === '\x1b[1~') {
        this.setState({ cursorPos: 0 });
        return true;
      }
      if (str === '\x1b[F' || str === '\x1b[4~') {
        this.setState({ cursorPos: this.state.value.length });
        return true;
      }

      // 11. Regular text / paste input
      if (str.length > 0 && !str.startsWith('\x1b')) {
        const cleanInput = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const before = this.state.value.slice(0, this.state.cursorPos);
        const after = this.state.value.slice(this.state.cursorPos);
        const nextVal = before + cleanInput + after;
        const nextPos = this.state.cursorPos + cleanInput.length;
        this.updateValueAndCheckCompletions(nextVal, nextPos);
        return true;
      }

      return false;
    });
  }

  private getAtData(): { query: string; atIndex: number } | null {
    const prefix = this.state.value.slice(0, this.state.cursorPos);
    const lastAt = prefix.lastIndexOf('@');
    if (
      lastAt !== -1 &&
      (lastAt === 0 || prefix[lastAt - 1] === ' ' || prefix[lastAt - 1] === '\t')
    ) {
      const query = prefix.slice(lastAt + 1);
      if (!query.includes(' ') && !query.includes('\t') && !query.includes('\n')) {
        return { query, atIndex: lastAt };
      }
    }
    return null;
  }

  private updateValueAndCheckCompletions(nextVal: string, nextPos: number): void {
    this.setState({ value: nextVal, cursorPos: nextPos });

    // Check @ file autocompletion
    const prefix = nextVal.slice(0, nextPos);
    const lastAt = prefix.lastIndexOf('@');
    if (
      lastAt !== -1 &&
      (lastAt === 0 || prefix[lastAt - 1] === ' ' || prefix[lastAt - 1] === '\t')
    ) {
      const query = prefix.slice(lastAt + 1);
      if (!query.includes(' ') && !query.includes('\t') && !query.includes('\n')) {
        const cwd = this.props.cwd || process.cwd();
        searchWorkspaceFiles(cwd, query).then((matches) => {
          this.setState({ fileMatches: matches, fileSelectIdx: 0 });
        });
        return;
      }
    }

    if (this.state.fileMatches.length > 0) {
      this.setState({ fileMatches: [] });
    }
  }

  override componentWillUnmount(): void {
    if (this.removeInputListener) {
      this.removeInputListener();
      this.removeInputListener = null;
    }
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
    if (this.escTimer) {
      clearTimeout(this.escTimer);
      this.escTimer = null;
    }
  }

  override getCursorPosition(): { line: number; column: number } | null {
    if (this.state.disabled) return null;

    let lineOffset = 0;
    if (this.state.escPending) lineOffset += 1;
    // Top border line offset
    lineOffset += 1;

    // Check lines before cursor
    const beforeCursor = this.state.value.slice(0, this.state.cursorPos);
    const beforeLines = beforeCursor.split('\n');
    const curLineIdx = beforeLines.length - 1;
    const curCol = stringWidth(beforeLines[curLineIdx] ?? '') + 4; // +4 for '  ❯ '

    return {
      line: lineOffset + curLineIdx,
      column: curCol,
    };
  }

  override render(): string[] {
    const theme = getTheme();
    const termWidth = process.stdout.columns || 80;
    const dividerWidth = Math.max(10, termWidth - 4);
    const {
      value,
      cursorPos,
      disabled,
      escPending,
      spinnerFrame,
      fileMatches,
      fileSelectIdx,
      paletteIdx,
    } = this.state;

    const lines: string[] = [];

    // Double-Esc Notice
    if (escPending) {
      const permColor = themeColor(theme.permission);
      lines.push(permColor('  Press Esc again to clear'));
    }

    const isBash = value.startsWith('!');
    const borderColor = disabled
      ? themeColor(theme.subtle)
      : isBash
        ? themeColor(theme.bashPink)
        : themeColor(theme.promptBorder);

    // Above-Border Thinking / Busy status wave
    if (disabled) {
      const brand = themeColor(theme.brand);
      const shimmer = themeColor(theme.brandShimmer);
      const spinnerGlyphs = figures.spinnerFrames;
      const glyph = brand(spinnerGlyphs[spinnerFrame % spinnerGlyphs.length] ?? '⠋');

      const wordIdx = Math.floor(spinnerFrame / 24) % STATUS_WORDS.length;
      const word = STATUS_WORDS[wordIdx] ?? 'thinking…';
      const wavePos = Math.floor(spinnerFrame / 2) % (word.length + 5);

      let waveText = '';
      for (let idx = 0; idx < word.length; idx++) {
        const char = word[idx]!;
        const dist = idx - (wavePos - 2);
        if (dist === 1) {
          waveText += shimmer(char);
        } else if (dist === 0 || dist === 2) {
          waveText += brand(char);
        } else {
          waveText += chalk.dim(char);
        }
      }

      lines.push(`  ${glyph} ${chalk.italic(waveText)}`);
      // Top Border
      lines.push(`  ${borderColor(figures.horizontalLine.repeat(dividerWidth))}`);
      // Inside box message
      lines.push(`    ${chalk.dim('Generating response… (Esc to stop)')}`);
      // Bottom Border
      lines.push(`  ${borderColor(figures.horizontalLine.repeat(dividerWidth))}`);
      return lines;
    }

    // Top Border
    lines.push(`  ${borderColor(figures.horizontalLine.repeat(dividerWidth))}`);

    // Input prompt line
    const chevColor = isBash ? themeColor(theme.bashPink) : themeColor(theme.text);
    const pointer = chevColor(`${figures.pointer} `);

    if (value.length === 0) {
      lines.push(`  ${pointer}${chalk.dim('Type your message...')}`);
    } else {
      const vLines = value.split('\n');
      for (let i = 0; i < vLines.length; i++) {
        const l = vLines[i] ?? '';
        const p = i === 0 ? pointer : '  ';
        lines.push(`  ${p}${chalk.white(l)}`);
      }
    }

    // Bottom Border
    lines.push(`  ${borderColor(figures.horizontalLine.repeat(dividerWidth))}`);

    // Inline CommandPalette
    const isSlashMode = value.startsWith('/') && !value.includes(' ');
    const matchingCommands: SlashCommand[] = isSlashMode
      ? defaultCommandRegistry
          .getAll()
          .filter((c) => `/${c.name}`.toLowerCase().startsWith(value.toLowerCase()))
      : [];

    if (isSlashMode && matchingCommands.length > 0 && value !== `/${matchingCommands[0]?.name} `) {
      const infoColor = themeColor(theme.info);
      lines.push(infoColor('  Commands'));
      for (let i = 0; i < matchingCommands.length; i++) {
        const cmd = matchingCommands[i]!;
        const isSelected = i === paletteIdx;
        const p = isSelected ? infoColor(`  ${figures.pointer} `) : '    ';
        const name = isSelected
          ? infoColor(`/${cmd.name}`.padEnd(16))
          : chalk.dim(`/${cmd.name}`.padEnd(16));
        const desc = isSelected ? chalk.white(cmd.description) : chalk.dim(cmd.description);
        lines.push(`${p}${name}${desc}`);
      }
    }

    // Inline FileMatches
    if (fileMatches.length > 0) {
      const infoColor = themeColor(theme.info);
      lines.push(chalk.dim('  Matching files (@):'));
      for (let i = 0; i < fileMatches.length; i++) {
        const f = fileMatches[i]!;
        const isSelected = i === fileSelectIdx;
        const p = isSelected ? infoColor(`  ${figures.pointer} `) : '    ';
        const fileText = isSelected ? infoColor(f) : chalk.dim(f);
        lines.push(`${p}${fileText}`);
      }
    }

    return lines;
  }
}
