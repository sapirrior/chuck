import Component from '../engine/Component.js';
import { defaultCommandRegistry } from '../../commands/registry.js';
import type { SlashCommand } from '../../commands/types.js';
import { searchWorkspaceFiles } from '../../utils/file-search.js';
import { getTheme, figures } from '../../theme/index.js';
import { themeColor, chalk, truncateToWidth } from '../utils/format.js';
import { parseKeyInput } from '../primitives/index.js';

export type VoiceInputMode = 'idle' | 'listening' | 'finalizing';

export interface PromptInputProps {
  onSubmit: (text: string) => void;
  onAbort?: () => void;
  onToggleHelp?: () => void;
  onVoiceCancel?: () => void;
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
  voiceMode: VoiceInputMode;
  voiceTranscript: string;
  voiceAnchor: number;
}

const STATUS_WORDS = [
  'thinking…',
  'analyzing…',
  'exploring…',
  'computing…',
  'crafting…',
  'generating…',
];

export function insertTextAtAnchor(
  base: string,
  anchor: number,
  insert: string,
): { value: string; cursorPos: number } {
  const trimmed = insert.trim();
  if (!trimmed) {
    return { value: base, cursorPos: anchor };
  }
  const before = base.slice(0, anchor);
  const after = base.slice(anchor);

  const needsLeadingSpace = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n');
  const needsTrailingSpace = after.length > 0 && !after.startsWith(' ') && !after.startsWith('\n');

  const leading = needsLeadingSpace ? ' ' : '';
  const trailing = needsTrailingSpace ? ' ' : '';

  const merged = `${before}${leading}${trimmed}${trailing}${after}`;
  const newPos = before.length + leading.length + trimmed.length;

  return { value: merged, cursorPos: newPos };
}

export default class PromptInput extends Component<PromptInputProps, PromptInputState> {
  override wrap = true;
  override clip = true;
  override ellipsis = false;

  private history: string[] = [];
  private draft = '';
  private removeInputListener: (() => void) | null = null;
  private spinnerTimer: NodeJS.Timeout | null = null;
  private escTimer: NodeJS.Timeout | null = null;
  private isMounted = false;

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
      voiceMode: 'idle',
      voiceTranscript: '',
      voiceAnchor: 0,
    };
  }

  private syncSpinnerTimer(): void {
    if (this.isMounted && this.state.disabled) {
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

  setDisabled(disabled: boolean): void {
    if (this.state.disabled === disabled) return;
    this.setState({ disabled });
    this.syncSpinnerTimer();
  }

  public get voiceMode(): VoiceInputMode {
    return this.state.voiceMode;
  }

  public startVoice(): void {
    this.setState({
      voiceMode: 'listening',
      voiceTranscript: '',
      voiceAnchor: this.state.cursorPos,
      fileMatches: [],
    });
  }

  public setVoiceTranscript(transcript: string): void {
    this.setState({ voiceTranscript: transcript });
  }

  public setVoiceMode(mode: VoiceInputMode): void {
    this.setState({ voiceMode: mode });
  }

  public finishVoice(finalTranscript?: string): void {
    const textToInsert =
      finalTranscript !== undefined ? finalTranscript : this.state.voiceTranscript;
    const { value, cursorPos } = insertTextAtAnchor(
      this.state.value,
      this.state.voiceAnchor,
      textToInsert,
    );
    this.setState({
      value,
      cursorPos,
      voiceMode: 'idle',
      voiceTranscript: '',
    });
  }

  public cancelVoice(): void {
    this.setState({
      voiceMode: 'idle',
      voiceTranscript: '',
    });
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
    this.isMounted = true;
    this.syncSpinnerTimer();
    if (!this.engine) return;

    this.removeInputListener = this.engine.addInputListener((chunk) => {
      const action = parseKeyInput(chunk);

      // 1. Generation in progress: Escape aborts
      if (this.state.disabled) {
        if (action.type === 'escape') {
          this.props.onAbort?.();
          return true;
        }
        return false;
      }

      // 2. Voice recording in progress: Escape cancels voice; swallow other typing
      if (this.state.voiceMode !== 'idle') {
        if (action.type === 'escape') {
          this.props.onVoiceCancel?.();
          this.finishVoice();
          return true;
        }
        return true; // Swallow typing during active voice dictation
      }

      // 3. Escape: dismiss completions or double-tap to clear
      if (action.type === 'escape') {
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

      // 4. Question mark when empty opens Help
      if (action.type === 'insert' && action.char === '?' && this.state.value.length === 0) {
        this.props.onToggleHelp?.();
        return true;
      }

      const isSlashMode = this.state.value.startsWith('/') && !this.state.value.includes(' ');
      const matchingCommands = isSlashMode
        ? defaultCommandRegistry
            .getAll()
            .filter((c) => `/${c.name}`.toLowerCase().startsWith(this.state.value.toLowerCase()))
        : [];

      // 5. Multiline Newline insertion
      if (action.type === 'newline') {
        const before = this.state.value.slice(0, this.state.cursorPos);
        const after = this.state.value.slice(this.state.cursorPos);
        this.updateValueAndCheckCompletions(`${before}\n${after}`, this.state.cursorPos + 1);
        return true;
      }

      // 6. Submit or \+Enter
      if (action.type === 'submit') {
        if (this.state.fileMatches.length > 0) {
          const atData = this.getAtData();
          if (atData) {
            const chosen = this.state.fileMatches[this.state.fileSelectIdx];
            if (chosen) {
              const before = this.state.value.slice(0, atData.atIndex);
              const after = this.state.value.slice(this.state.cursorPos);
              this.setState({
                value: `${before}@${chosen} ${after}`,
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
            const cmdText = `/${chosen.name}`;
            this.addHistory(cmdText);
            this.setState({ value: '', cursorPos: 0, fileMatches: [] });
            this.props.onSubmit(cmdText);
            return true;
          }
        }

        if (this.state.cursorPos > 0 && this.state.value[this.state.cursorPos - 1] === '\\') {
          const before = this.state.value.slice(0, this.state.cursorPos - 1);
          const after = this.state.value.slice(this.state.cursorPos);
          this.updateValueAndCheckCompletions(`${before}\n${after}`, this.state.cursorPos);
          return true;
        }

        const trimmed = this.state.value.trim();
        if (trimmed) {
          this.addHistory(trimmed);
          this.setState({ value: '', cursorPos: 0, fileMatches: [] });
          this.props.onSubmit(trimmed);
        }
        return true;
      }

      // 7. Tab Completion
      if (action.type === 'tab') {
        if (this.state.fileMatches.length > 0) {
          const atData = this.getAtData();
          if (atData) {
            const chosen = this.state.fileMatches[this.state.fileSelectIdx];
            if (chosen) {
              const before = this.state.value.slice(0, atData.atIndex);
              const after = this.state.value.slice(this.state.cursorPos);
              this.setState({
                value: `${before}@${chosen} ${after}`,
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
            this.setState({ value: completed, cursorPos: completed.length });
            return true;
          }
        }
        return true;
      }

      // 8. Arrow Up
      if (action.type === 'cursor-up') {
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

        const beforeCursor = this.state.value.slice(0, this.state.cursorPos);
        const lastNewline = beforeCursor.lastIndexOf('\n');
        if (lastNewline !== -1) {
          const colOnCurLine = this.state.cursorPos - (lastNewline + 1);
          const prevNewline = beforeCursor.slice(0, lastNewline).lastIndexOf('\n');
          const prevLineStart = prevNewline === -1 ? 0 : prevNewline + 1;
          const prevLineLen = lastNewline - prevLineStart;
          this.setState({ cursorPos: prevLineStart + Math.min(colOnCurLine, prevLineLen) });
          return true;
        }

        if (this.history.length > 0) {
          if (this.state.historyIndex === -1) this.draft = this.state.value;
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

      // 9. Arrow Down
      if (action.type === 'cursor-down') {
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

        const nextNewline = this.state.value.indexOf('\n', this.state.cursorPos);
        if (nextNewline !== -1) {
          const beforeCursor = this.state.value.slice(0, this.state.cursorPos);
          const lastNewline = beforeCursor.lastIndexOf('\n');
          const colOnCurLine =
            lastNewline === -1 ? this.state.cursorPos : this.state.cursorPos - (lastNewline + 1);
          const nextLineStart = nextNewline + 1;
          const nextNextNewline = this.state.value.indexOf('\n', nextLineStart);
          const nextLineEnd = nextNextNewline === -1 ? this.state.value.length : nextNextNewline;
          this.setState({
            cursorPos: nextLineStart + Math.min(colOnCurLine, nextLineEnd - nextLineStart),
          });
          return true;
        }

        if (this.state.historyIndex !== -1) {
          const nextIndex = this.state.historyIndex + 1;
          if (nextIndex >= this.history.length) {
            this.setState({ historyIndex: -1, value: this.draft, cursorPos: this.draft.length });
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

      // 10. Backspace & Deletion
      if (action.type === 'backspace') {
        if (this.state.cursorPos > 0) {
          const before = this.state.value.slice(0, this.state.cursorPos - 1);
          const after = this.state.value.slice(this.state.cursorPos);
          this.updateValueAndCheckCompletions(before + after, this.state.cursorPos - 1);
        }
        return true;
      }
      if (action.type === 'delete') {
        if (this.state.cursorPos < this.state.value.length) {
          const before = this.state.value.slice(0, this.state.cursorPos);
          const after = this.state.value.slice(this.state.cursorPos + 1);
          this.updateValueAndCheckCompletions(before + after, this.state.cursorPos);
        }
        return true;
      }
      if (action.type === 'delete-word') {
        const before = this.state.value.slice(0, this.state.cursorPos);
        const match = before.match(/(\s*\S+)\s*$/);
        const deleteCount = match ? match[0].length : 1;
        const newPos = Math.max(0, this.state.cursorPos - deleteCount);
        this.updateValueAndCheckCompletions(
          this.state.value.slice(0, newPos) + this.state.value.slice(this.state.cursorPos),
          newPos,
        );
        return true;
      }
      if (action.type === 'clear-line') {
        this.updateValueAndCheckCompletions('', 0);
        return true;
      }

      // 11. Navigation Left/Right/Home/End
      if (action.type === 'cursor-left') {
        this.setState({ cursorPos: Math.max(0, this.state.cursorPos - 1) });
        return true;
      }
      if (action.type === 'cursor-right') {
        this.setState({ cursorPos: Math.min(this.state.value.length, this.state.cursorPos + 1) });
        return true;
      }
      if (action.type === 'cursor-home') {
        this.setState({ cursorPos: 0 });
        return true;
      }
      if (action.type === 'cursor-end') {
        this.setState({ cursorPos: this.state.value.length });
        return true;
      }

      // 12. Text insertion
      if (action.type === 'insert' && action.char) {
        const clean = action.char.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const before = this.state.value.slice(0, this.state.cursorPos);
        const after = this.state.value.slice(this.state.cursorPos);
        this.updateValueAndCheckCompletions(
          before + clean + after,
          this.state.cursorPos + clean.length,
        );
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
    this.isMounted = false;
    this.syncSpinnerTimer();
    if (this.removeInputListener) {
      this.removeInputListener();
      this.removeInputListener = null;
    }
    if (this.escTimer) {
      clearTimeout(this.escTimer);
      this.escTimer = null;
    }
  }

  override render(width?: number): string[] {
    return this.renderWithCursor(width).lines;
  }

  override renderWithCursor(width?: number): {
    lines: string[];
    cursor: { logicalLineIndex: number; characterOffsetWithinLine: number } | null;
  } {
    const theme = getTheme();
    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(1, termWidth);
    const dividerWidth = maxCols;
    const {
      value,
      cursorPos,
      disabled,
      escPending,
      spinnerFrame,
      fileMatches,
      fileSelectIdx,
      paletteIdx,
      historyIndex,
      voiceMode,
      voiceTranscript,
      voiceAnchor,
    } = this.state;

    const lines: string[] = [];
    let cursor: { logicalLineIndex: number; characterOffsetWithinLine: number } | null = null;

    if (escPending) {
      lines.push(themeColor(theme.permission)('Press Esc again to clear'));
    }

    const borderColor = disabled ? themeColor(theme.subtle) : themeColor(theme.promptBorder);

    // 1. Disabled (generating) state — Compact layout (Section 19)
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

      lines.push(borderColor(figures.horizontalLine.repeat(dividerWidth)));
      lines.push(
        truncateToWidth(
          `${glyph} ${chalk.italic(waveText)}   ${chalk.dim('Esc to stop')}`,
          maxCols,
        ),
      );
      lines.push(borderColor(figures.horizontalLine.repeat(dividerWidth)));
      return { lines, cursor: null };
    }

    // Top Border (embeds History text in white on the border without extra lines)
    if (historyIndex !== -1 && this.history.length > 0) {
      const histText = ` History ${historyIndex + 1}/${this.history.length} `;
      const leftDashes = borderColor(figures.horizontalLine.repeat(4));
      const rightLen = Math.max(0, maxCols - (4 + histText.length));
      const rightDashes = borderColor(figures.horizontalLine.repeat(rightLen));
      lines.push(`${leftDashes}${chalk.white(histText)}${rightDashes}`);
    } else {
      lines.push(borderColor(figures.horizontalLine.repeat(dividerWidth)));
    }

    // 2. Active Voice mode with no transcript yet
    if (voiceMode !== 'idle' && !voiceTranscript) {
      const brand = themeColor(theme.brand);
      const listeningBullet = themeColor(theme.error)(figures.bullet);
      const statusText =
        voiceMode === 'listening'
          ? `${listeningBullet} ${chalk.bold('Listening…')}   ${chalk.dim('Ctrl+T to stop')}`
          : `${brand('⠋')} ${chalk.dim('Finalizing transcript…')}`;

      lines.push(truncateToWidth(statusText, maxCols));
      lines.push(borderColor(figures.horizontalLine.repeat(dividerWidth)));
      return { lines, cursor: null };
    }

    // 3. Normal input line(s) or live voice transcript insertion
    const displayData =
      voiceMode !== 'idle' && voiceTranscript
        ? insertTextAtAnchor(value, voiceAnchor, voiceTranscript)
        : { value, cursorPos };

    const effectiveValue = displayData.value;
    const effectiveCursorPos = displayData.cursorPos;

    const chevColor = themeColor(theme.userChevron);
    const pointer = chevColor(`${figures.pointerBold} `);
    const prefixLen = 2;

    if (effectiveValue.length === 0) {
      cursor = {
        logicalLineIndex: lines.length,
        characterOffsetWithinLine: prefixLen,
      };
      lines.push(truncateToWidth(`${pointer}${chalk.dim('Type your message...')}`, maxCols));
    } else {
      const vLines = effectiveValue.split('\n');
      let currentOffset = 0;

      for (let i = 0; i < vLines.length; i++) {
        const l = vLines[i] ?? '';
        const lineLen = l.length;
        const isLast = i === vLines.length - 1;
        const lineEndOffset = currentOffset + lineLen;

        if (
          cursor === null &&
          effectiveCursorPos >= currentOffset &&
          (effectiveCursorPos <= lineEndOffset || isLast)
        ) {
          cursor = {
            logicalLineIndex: lines.length,
            characterOffsetWithinLine: prefixLen + (effectiveCursorPos - currentOffset),
          };
        }

        const p = i === 0 ? pointer : '  ';
        lines.push(`${p}${chalk.white(l)}`);
        currentOffset = lineEndOffset + 1;
      }
    }

    // Bottom Border
    lines.push(borderColor(figures.horizontalLine.repeat(dividerWidth)));

    // Inline CommandPalette
    const isSlashMode =
      voiceMode === 'idle' && effectiveValue.startsWith('/') && !effectiveValue.includes(' ');
    const matchingCommands: SlashCommand[] = isSlashMode
      ? defaultCommandRegistry
          .getAll()
          .filter((c) => `/${c.name}`.toLowerCase().startsWith(effectiveValue.toLowerCase()))
      : [];

    if (
      isSlashMode &&
      matchingCommands.length > 0 &&
      effectiveValue !== `/${matchingCommands[0]?.name} `
    ) {
      for (let i = 0; i < matchingCommands.length; i++) {
        const cmd = matchingCommands[i]!;
        const isSelected = i === paletteIdx;
        const namePadded = `/${cmd.name}`.padEnd(18);
        if (isSelected) {
          lines.push(
            truncateToWidth(
              `${chalk.white.bold(namePadded)}${chalk.white.bold(cmd.description)}`,
              maxCols,
            ),
          );
        } else {
          lines.push(
            truncateToWidth(`${chalk.dim(namePadded)}${chalk.dim(cmd.description)}`, maxCols),
          );
        }
      }
    }

    // Inline FileMatches
    if (voiceMode === 'idle' && fileMatches.length > 0) {
      const infoColor = themeColor(theme.info);
      lines.push(chalk.dim('Matching files (@):'));
      for (let i = 0; i < fileMatches.length; i++) {
        const f = fileMatches[i]!;
        const isSelected = i === fileSelectIdx;
        const p = isSelected ? infoColor(`${figures.pointerBold} `) : '  ';
        const fileText = isSelected ? infoColor(f) : chalk.dim(f);
        lines.push(truncateToWidth(`${p}${fileText}`, maxCols));
      }
    }

    return { lines, cursor };
  }
}
