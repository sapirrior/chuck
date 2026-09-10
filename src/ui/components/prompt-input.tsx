import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { defaultCommandRegistry } from '../../commands/registry.js';
import { useDoublePress } from '../hooks/use-double-press.js';
import { figures, getTheme } from '../theme/index.js';

export interface PromptInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  onAbort?: () => void;
  onExit?: () => void;
  exitPending?: boolean;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  onSubmit,
  disabled = false,
  onAbort,
  onExit,
  exitPending = false,
}) => {
  const theme = getTheme();
  const [value, setValue] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [escPending, setEscPending] = useState(false);

  // Match slash commands for autocomplete hints
  const slashCommands = defaultCommandRegistry.getAll();
  const matchingCommand =
    value.startsWith('/') && !value.includes(' ')
      ? slashCommands.find((c) => `/${c.name}`.startsWith(value))
      : undefined;

  // Double-press Escape to clear input bar
  const handleEscapeDoublePress = useDoublePress(
    (pending) => setEscPending(pending),
    () => {
      setValue('');
      setCursorPos(0);
      setHistoryIndex(-1);
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

      // 2. Escape when not generating: Double press clears input
      if (key.escape) {
        if (value.length > 0) {
          handleEscapeDoublePress();
        }
        return;
      }

      // 3. Submit on Return
      if (key.return) {
        const trimmed = value.trim();
        if (trimmed) {
          setHistory((prev) => [...prev, trimmed]);
          setHistoryIndex(-1);
          setValue('');
          setCursorPos(0);
          onSubmit(trimmed);
        }
        return;
      }

      // 4. Tab completion for slash command
      if (key.tab && matchingCommand) {
        const completed = `/${matchingCommand.name} `;
        setValue(completed);
        setCursorPos(completed.length);
        return;
      }

      // 5. Arrow Up (History recall)
      if (key.upArrow) {
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

      // 6. Arrow Down (History recall forward)
      if (key.downArrow) {
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

      // 7. Backspace / Delete
      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          const before = value.slice(0, cursorPos - 1);
          const after = value.slice(cursorPos);
          setValue(before + after);
          setCursorPos(cursorPos - 1);
        }
        return;
      }

      // 8. Left / Right navigation
      if (key.leftArrow) {
        setCursorPos(Math.max(0, cursorPos - 1));
        return;
      }
      if (key.rightArrow) {
        setCursorPos(Math.min(value.length, cursorPos + 1));
        return;
      }

      // 9. Regular text input
      if (input && !key.ctrl && !key.meta) {
        const before = value.slice(0, cursorPos);
        const after = value.slice(cursorPos);
        setValue(before + input + after);
        setCursorPos(cursorPos + input.length);
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" marginTop={1} width="100%">
      {/* Dynamic hint banner: double-esc or autocomplete */}
      {escPending ? (
        <Box paddingLeft={2} marginBottom={0}>
          <Text color={theme.permission}>Press Esc again to clear</Text>
        </Box>
      ) : matchingCommand && value !== `/${matchingCommand.name} ` ? (
        <Box paddingLeft={2} marginBottom={0}>
          <Text dimColor>
            Tab to complete: <Text color={theme.permission}>/{matchingCommand.name}</Text> -{' '}
            {matchingCommand.description}
          </Text>
        </Box>
      ) : null}

      {/* Input Box matching Claude Code 1:1 round top/bottom borders (borderLeft={false} borderRight={false} borderBottom) */}
      <Box
        flexDirection="row"
        alignItems="flex-start"
        borderStyle="round"
        borderColor={disabled ? theme.subtle : theme.promptBorder}
        borderLeft={false}
        borderRight={false}
        borderBottom
        width="100%"
        paddingX={1}
      >
        <Text color={theme.brand}>{figures.pointer} </Text>
        <Box flexGrow={1}>
          {value.length === 0 ? (
            <Text dimColor>Type a prompt or /model, /clear...</Text>
          ) : (
            <Text color={theme.text}>
              {value.slice(0, cursorPos)}
              <Text inverse>{value[cursorPos] ?? ' '}</Text>
              {value.slice(cursorPos + 1)}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};
