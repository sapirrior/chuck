import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useDoublePress } from '../hooks/use-double-press.js';
import { useInputCompletions } from '../hooks/use-input-completions.js';
import { figures, getTheme } from '../theme/index.js';
import { CommandPalette } from './docks/command-palette.js';
import { FileMatches } from './docks/file-matches.js';

export interface PromptInputProps {
  onSubmit: (text: string, isBash?: boolean) => void;
  disabled?: boolean;
  onAbort?: () => void;
  onExit?: () => void;
  exitPending?: boolean;
  cwd?: string;
  onToggleHelp?: () => void;
  initialHistory?: string[];
}

function getCursorLineCol(text: string, cursorPos: number) {
  const beforeCursor = text.slice(0, cursorPos);
  const beforeLines = beforeCursor.split('\n');
  const lineIdx = beforeLines.length - 1;
  const colIdx = beforeLines[lineIdx]?.length ?? 0;
  const allLines = text.split('\n');
  return {
    lineIdx,
    colIdx,
    totalLines: allLines.length,
    lines: allLines,
  };
}

function getOffsetFromLineCol(lines: string[], lineIdx: number, colIdx: number): number {
  let offset = 0;
  for (let i = 0; i < lineIdx; i++) {
    offset += (lines[i]?.length ?? 0) + 1; // + 1 for '\n'
  }
  const targetLineLen = lines[lineIdx]?.length ?? 0;
  return offset + Math.min(colIdx, targetLineLen);
}

const STATUS_WORDS = [
  'thinking…',
  'analyzing…',
  'exploring…',
  'computing…',
  'crafting…',
  'generating…',
];

export const PromptInput: React.FC<PromptInputProps> = ({
  onSubmit,
  disabled = false,
  onAbort,
  exitPending = false,
  cwd = process.cwd(),
  onToggleHelp,
  initialHistory,
}) => {
  const theme = getTheme();
  const [value, setValue] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [history, setHistory] = useState<string[]>(() => initialHistory ?? []);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const draftRef = useRef<string>('');
  const [escPending, setEscPending] = useState(false);
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  const MAX_INPUT_LINES = 6;

  // Auto-scroll the 6-line window to follow cursor
  useEffect(() => {
    const { lineIdx, totalLines } = getCursorLineCol(value, cursorPos);
    setScrollOffset((prev) => {
      let next = prev;
      if (lineIdx < next) {
        next = lineIdx;
      } else if (lineIdx >= next + MAX_INPUT_LINES) {
        next = lineIdx - MAX_INPUT_LINES + 1;
      }
      const maxOffset = Math.max(0, totalLines - MAX_INPUT_LINES);
      return Math.max(0, Math.min(next, maxOffset));
    });
  }, [value, cursorPos]);

  useEffect(() => {
    if (initialHistory && initialHistory.length > 0) {
      setHistory(initialHistory);
    }
  }, [initialHistory]);

  // Spinner & sweeping wave animation when disabled / busy
  useEffect(() => {
    if (!disabled) return;
    const interval = setInterval(() => {
      setSpinnerFrame((f) => f + 1);
    }, 80);
    return () => clearInterval(interval);
  }, [disabled]);

  const {
    atData,
    fileMatches,
    setFileMatches,
    fileSelectIdx,
    setFileSelectIdx,
    isSlashMode,
    matchingCommands,
    paletteIdx,
    setPaletteIdx,
  } = useInputCompletions({ value, cursorPos, cwd });

  const isBashMode = value.startsWith('!');

  // Double-press Escape to clear input bar
  const handleEscapeDoublePress = useDoublePress(
    (pending) => setEscPending(pending),
    () => {
      setValue('');
      setCursorPos(0);
      setHistoryIndex(-1);
      setFileMatches([]);
    },
  );

  useInput(
    (input, key) => {
      // 1. If currently generating (disabled), Escape stops generation immediately
      if (disabled) {
        if (key.escape) {
          onAbort?.();
        }
        return;
      }

      // 2. Escape dismisses popovers or double-press clears input
      if (key.escape) {
        if (fileMatches.length > 0) {
          setFileMatches([]);
          return;
        }
        if (value.length > 0) {
          handleEscapeDoublePress();
        }
        return;
      }

      // 3. Question mark '?' when prompt is empty opens Help Dock
      if (input === '?' && value.length === 0) {
        onToggleHelp?.();
        return;
      }

      // 4. Submit on Return (or insert newline if preceded by backslash \)
      if (key.return) {
        // If file match popup active, insert file
        if (fileMatches.length > 0 && atData) {
          const chosen = fileMatches[fileSelectIdx];
          if (chosen) {
            const before = value.slice(0, atData.atIndex);
            const after = value.slice(cursorPos);
            const inserted = `${before}@${chosen} ${after}`;
            setValue(inserted);
            setCursorPos(atData.atIndex + 1 + chosen.length + 1);
            setFileMatches([]);
            return;
          }
        }

        // If slash palette active and exactly 1 command matches
        if (isSlashMode && matchingCommands.length > 0) {
          const chosen = matchingCommands[paletteIdx] ?? matchingCommands[0];
          if (chosen) {
            const cmdText = `/${chosen.name}`;
            setHistory((prev) =>
              prev.length > 0 && prev[prev.length - 1] === cmdText ? prev : [...prev, cmdText],
            );
            setHistoryIndex(-1);
            draftRef.current = '';
            setValue('');
            setCursorPos(0);
            onSubmit(cmdText);
            return;
          }
        }

        // Multiline insertion with \ + Enter
        if (cursorPos > 0 && value[cursorPos - 1] === '\\') {
          const before = value.slice(0, cursorPos - 1);
          const after = value.slice(cursorPos);
          const withNewline = `${before}\n${after}`;
          setValue(withNewline);
          setCursorPos(cursorPos);
          return;
        }

        const trimmed = value.trim();
        if (trimmed) {
          setHistory((prev) =>
            prev.length > 0 && prev[prev.length - 1] === trimmed ? prev : [...prev, trimmed],
          );
          setHistoryIndex(-1);
          draftRef.current = '';
          setValue('');
          setCursorPos(0);
          setFileMatches([]);
          if (isBashMode) {
            onSubmit(trimmed.slice(1).trim(), true);
          } else {
            onSubmit(trimmed, false);
          }
        }
        return;
      }

      // 5. Explicit newline insertion via Alt+Enter or Ctrl+J
      if ((key.meta && key.return) || (key.ctrl && input === 'j')) {
        const before = value.slice(0, cursorPos);
        const after = value.slice(cursorPos);
        setValue(`${before}\n${after}`);
        setCursorPos(cursorPos + 1);
        return;
      }

      // 6. Tab completion
      if (key.tab) {
        if (fileMatches.length > 0 && atData) {
          const chosen = fileMatches[fileSelectIdx];
          if (chosen) {
            const before = value.slice(0, atData.atIndex);
            const after = value.slice(cursorPos);
            const inserted = `${before}@${chosen} ${after}`;
            setValue(inserted);
            setCursorPos(atData.atIndex + 1 + chosen.length + 1);
            setFileMatches([]);
            return;
          }
        }

        if (isSlashMode && matchingCommands.length > 0) {
          const chosen = matchingCommands[paletteIdx] ?? matchingCommands[0];
          if (chosen) {
            const completed = `/${chosen.name} `;
            setValue(completed);
            setCursorPos(completed.length);
            return;
          }
        }
      }

      // 7. Arrow Up
      if (key.upArrow) {
        if (fileMatches.length > 0) {
          setFileSelectIdx((prev) => (prev > 0 ? prev - 1 : fileMatches.length - 1));
          return;
        }
        if (isSlashMode && matchingCommands.length > 0) {
          setPaletteIdx((prev) => (prev > 0 ? prev - 1 : matchingCommands.length - 1));
          return;
        }

        const { lineIdx, colIdx, lines } = getCursorLineCol(value, cursorPos);

        // If not on top line, move cursor up one line at the same column
        if (lineIdx > 0) {
          const newPos = getOffsetFromLineCol(lines, lineIdx - 1, colIdx);
          setCursorPos(newPos);
          return;
        }

        // Cursor is on the top line (or single-line input): travel to older history
        if (history.length > 0) {
          if (historyIndex === -1) {
            draftRef.current = value;
          }
          const nextIndex =
            historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
          setHistoryIndex(nextIndex);
          const historical = history[nextIndex] ?? '';
          setValue(historical);
          setCursorPos(historical.length);
        }
        return;
      }

      // 8. Arrow Down
      if (key.downArrow) {
        if (fileMatches.length > 0) {
          setFileSelectIdx((prev) => (prev < fileMatches.length - 1 ? prev + 1 : 0));
          return;
        }
        if (isSlashMode && matchingCommands.length > 0) {
          setPaletteIdx((prev) => (prev < matchingCommands.length - 1 ? prev + 1 : 0));
          return;
        }

        const { lineIdx, colIdx, lines, totalLines } = getCursorLineCol(value, cursorPos);

        // If not on bottom line, move cursor down one line at the same column
        if (lineIdx < totalLines - 1) {
          const newPos = getOffsetFromLineCol(lines, lineIdx + 1, colIdx);
          setCursorPos(newPos);
          return;
        }

        // Cursor is on the bottom line (or single-line input): travel to newer history
        if (historyIndex !== -1) {
          const nextIndex = historyIndex + 1;
          if (nextIndex >= history.length) {
            setHistoryIndex(-1);
            setValue(draftRef.current);
            setCursorPos(draftRef.current.length);
            draftRef.current = '';
          } else {
            setHistoryIndex(nextIndex);
            const historical = history[nextIndex] ?? '';
            setValue(historical);
            setCursorPos(historical.length);
          }
        }
        return;
      }

      // 9. Backspace / Delete
      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          const before = value.slice(0, cursorPos - 1);
          const after = value.slice(cursorPos);
          setValue(before + after);
          setCursorPos(cursorPos - 1);
        }
        return;
      }

      // 10. Left / Right navigation
      if (key.leftArrow) {
        setCursorPos(Math.max(0, cursorPos - 1));
        return;
      }
      if (key.rightArrow) {
        setCursorPos(Math.min(value.length, cursorPos + 1));
        return;
      }

      // 11. Regular text input & multiline paste
      if (input && !key.ctrl && !key.meta) {
        const cleanInput = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const before = value.slice(0, cursorPos);
        const after = value.slice(cursorPos);
        setValue(before + cleanInput + after);
        setCursorPos(cursorPos + cleanInput.length);
      }
    },
    { isActive: true },
  );

  const promptChevronColor = isBashMode ? theme.bashPink : theme.text;
  const borderColor = disabled ? theme.subtle : isBashMode ? theme.bashPink : theme.promptBorder;

  // Sweeping traveling wave calculation matching Delta & Claude Code
  const currentWordIdx = Math.floor(spinnerFrame / 24) % STATUS_WORDS.length;
  const currentWord = STATUS_WORDS[currentWordIdx] ?? 'thinking…';
  const wavePos = Math.floor(spinnerFrame / 2) % (currentWord.length + 5);

  const spinnerGlyphs = figures.spinnerFrames;
  const currentGlyph = spinnerGlyphs[spinnerFrame % spinnerGlyphs.length] ?? '⠋';

  // Multiline text splitting with embedded cursor marker
  const textWithCursor =
    cursorPos >= value.length
      ? `${value}\x00`
      : `${value.slice(0, cursorPos)}\x00${value.slice(cursorPos)}`;
  const logicalLines = textWithCursor.split('\n');

  // Calculate sliding 6-line window and overflow indicators
  const visibleInputLines = logicalLines.slice(scrollOffset, scrollOffset + MAX_INPUT_LINES);
  const linesAbove = scrollOffset;
  const linesBelow = Math.max(0, logicalLines.length - (scrollOffset + MAX_INPUT_LINES));

  return (
    <Box flexDirection="column" marginTop={1} width="100%">
      {/* Double-Esc Notice */}
      {escPending ? (
        <Box paddingLeft={2} marginBottom={0}>
          <Text color={theme.permission}>Press Esc again to clear</Text>
        </Box>
      ) : null}

      {/* Above Border Animated Thinking Status (Claude Code 1:1) */}
      {disabled ? (
        <Box flexDirection="row" paddingLeft={1} marginBottom={0}>
          <Text color={theme.brand}>{currentGlyph} </Text>
          <Text italic>
            {currentWord.split('').map((char, idx) => {
              const dist = idx - (wavePos - 2);
              if (dist === 1) {
                return (
                  <Text key={idx} color={theme.brandShimmer}>
                    {char}
                  </Text>
                );
              }
              if (dist === 0 || dist === 2) {
                return (
                  <Text key={idx} color={theme.brand}>
                    {char}
                  </Text>
                );
              }
              return (
                <Text key={idx} dimColor>
                  {char}
                </Text>
              );
            })}
          </Text>
        </Box>
      ) : null}

      {/* Input Box */}
      <Box
        flexDirection="row"
        alignItems="flex-start"
        borderStyle="round"
        borderColor={borderColor}
        borderLeft={false}
        borderRight={false}
        borderBottom
        width="100%"
        paddingX={1}
      >
        <Text color={promptChevronColor}>{figures.pointer} </Text>
        <Box flexGrow={1} flexDirection="column">
          {disabled ? (
            <Text dimColor>Generating response… (Esc to stop)</Text>
          ) : value.length === 0 ? (
            <Text dimColor>Type a prompt, ! for bash, or / for commands...</Text>
          ) : (
            <>
              {linesAbove > 0 ? (
                <Text dimColor>
                  ▲ +{linesAbove} line{linesAbove > 1 ? 's' : ''} above
                </Text>
              ) : null}

              {visibleInputLines.map((line, idx) => {
                const actualLineIdx = scrollOffset + idx;
                if (line.includes('\x00')) {
                  const parts = line.split('\x00');
                  const before = parts[0] ?? '';
                  const after = parts[1] ?? '';
                  const atChar = after.length > 0 ? after[0] : ' ';
                  const rest = after.length > 0 ? after.slice(1) : '';

                  return (
                    <Text key={actualLineIdx} color={theme.text}>
                      {before}
                      <Text inverse>{atChar}</Text>
                      {rest}
                    </Text>
                  );
                }
                return (
                  <Text key={actualLineIdx} color={theme.text}>
                    {line}
                  </Text>
                );
              })}

              {linesBelow > 0 ? (
                <Text dimColor>
                  ▼ +{linesBelow} line{linesBelow > 1 ? 's' : ''} below
                </Text>
              ) : null}
            </>
          )}
        </Box>
      </Box>

      {/* Command Palette Dock (rendered directly under input bar like Delta) */}
      {isSlashMode && matchingCommands.length > 0 && value !== `/${matchingCommands[0]?.name} ` ? (
        <CommandPalette commands={matchingCommands} selectedIndex={paletteIdx} />
      ) : null}

      {/* File Matches Dock (rendered directly under input bar like Delta) */}
      {fileMatches.length > 0 ? (
        <FileMatches files={fileMatches} selectedIndex={fileSelectIdx} />
      ) : null}
    </Box>
  );
};
