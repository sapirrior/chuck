import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { defaultCommandRegistry } from '../../commands/registry.js';
import type { SlashCommand } from '../../commands/types.js';
import { useDoublePress } from '../hooks/use-double-press.js';
import { figures, getTheme } from '../theme/index.js';
import { searchWorkspaceFiles } from '../utils/file-search.js';
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
}

export const PromptInput: React.FC<PromptInputProps> = ({
  onSubmit,
  disabled = false,
  onAbort,
  exitPending = false,
  cwd = process.cwd(),
  onToggleHelp,
}) => {
  const theme = getTheme();
  const [value, setValue] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [escPending, setEscPending] = useState(false);

  // File matching state (@)
  const [fileMatches, setFileMatches] = useState<string[]>([]);
  const [fileSelectIdx, setFileSelectIdx] = useState(0);

  // Command palette state (/)
  const [paletteIdx, setPaletteIdx] = useState(0);

  const isBashMode = value.startsWith('!');

  // Check @ query at cursor
  const getAtQuery = (): { query: string; atIndex: number } | null => {
    const prefix = value.slice(0, cursorPos);
    const lastAt = prefix.lastIndexOf('@');
    if (lastAt === -1) return null;
    if (lastAt > 0 && prefix[lastAt - 1] !== ' ' && prefix[lastAt - 1] !== '\t') return null;
    const query = prefix.slice(lastAt + 1);
    if (query.includes(' ') || query.includes('\t')) return null;
    return { query, atIndex: lastAt };
  };

  const atData = getAtQuery();

  // Trigger file search on @
  useEffect(() => {
    if (atData) {
      let active = true;
      searchWorkspaceFiles(cwd, atData.query).then((matches) => {
        if (active) {
          setFileMatches(matches);
          setFileSelectIdx(0);
        }
      });
      return () => {
        active = false;
      };
    } else {
      setFileMatches([]);
    }
  }, [atData?.query, cwd]);

  // Slash commands filtering
  const allCommands = defaultCommandRegistry.getAll();
  const isSlashMode = value.startsWith('/') && !value.includes(' ');
  const matchingCommands: SlashCommand[] = isSlashMode
    ? allCommands.filter((c) => `/${c.name}`.toLowerCase().startsWith(value.toLowerCase()))
    : [];

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

      // 4. Submit on Return
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
            setHistory((prev) => [...prev, cmdText]);
            setHistoryIndex(-1);
            setValue('');
            setCursorPos(0);
            onSubmit(cmdText);
            return;
          }
        }

        const trimmed = value.trim();
        if (trimmed) {
          setHistory((prev) => [...prev, trimmed]);
          setHistoryIndex(-1);
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

      // 5. Tab completion
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

      // 6. Arrow Up
      if (key.upArrow) {
        if (fileMatches.length > 0) {
          setFileSelectIdx((prev) => (prev > 0 ? prev - 1 : fileMatches.length - 1));
          return;
        }
        if (isSlashMode && matchingCommands.length > 0) {
          setPaletteIdx((prev) => (prev > 0 ? prev - 1 : matchingCommands.length - 1));
          return;
        }
        if (history.length > 0) {
          const nextIndex =
            historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
          setHistoryIndex(nextIndex);
          const historical = history[nextIndex] ?? '';
          setValue(historical);
          setCursorPos(historical.length);
        }
        return;
      }

      // 7. Arrow Down
      if (key.downArrow) {
        if (fileMatches.length > 0) {
          setFileSelectIdx((prev) => (prev < fileMatches.length - 1 ? prev + 1 : 0));
          return;
        }
        if (isSlashMode && matchingCommands.length > 0) {
          setPaletteIdx((prev) => (prev < matchingCommands.length - 1 ? prev + 1 : 0));
          return;
        }
        if (historyIndex !== -1) {
          const nextIndex = historyIndex + 1;
          if (nextIndex >= history.length) {
            setHistoryIndex(-1);
            setValue('');
            setCursorPos(0);
          } else {
            setHistoryIndex(nextIndex);
            const historical = history[nextIndex] ?? '';
            setValue(historical);
            setCursorPos(historical.length);
          }
        }
        return;
      }

      // 8. Backspace / Delete
      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          const before = value.slice(0, cursorPos - 1);
          const after = value.slice(cursorPos);
          setValue(before + after);
          setCursorPos(cursorPos - 1);
        }
        return;
      }

      // 9. Left / Right navigation
      if (key.leftArrow) {
        setCursorPos(Math.max(0, cursorPos - 1));
        return;
      }
      if (key.rightArrow) {
        setCursorPos(Math.min(value.length, cursorPos + 1));
        return;
      }

      // 10. Regular text input
      if (input && !key.ctrl && !key.meta) {
        const before = value.slice(0, cursorPos);
        const after = value.slice(cursorPos);
        setValue(before + input + after);
        setCursorPos(cursorPos + input.length);
      }
    },
    { isActive: true },
  );

  const promptChevronColor = isBashMode ? theme.bashPink : theme.text;
  const borderColor = disabled ? theme.subtle : isBashMode ? theme.bashPink : theme.promptBorder;

  return (
    <Box flexDirection="column" marginTop={1} width="100%">
      {/* Double-Esc Notice */}
      {escPending ? (
        <Box paddingLeft={2} marginBottom={0}>
          <Text color={theme.permission}>Press Esc again to clear</Text>
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
        <Text color={promptChevronColor}>
          {figures.pointer}{' '}
        </Text>
        <Box flexGrow={1}>
          {value.length === 0 ? (
            <Text dimColor>Type a prompt, ! for bash, or / for commands...</Text>
          ) : (
            <Text color={theme.text}>
              {value.slice(0, cursorPos)}
              <Text inverse>{value[cursorPos] ?? ' '}</Text>
              {value.slice(cursorPos + 1)}
            </Text>
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
