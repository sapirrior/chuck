import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { defaultCommandRegistry } from '../../commands/registry.js';
import { figures, getTheme } from '../theme/index.js';

export interface PromptInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export const PromptInput: React.FC<PromptInputProps> = ({ onSubmit, disabled = false }) => {
  const theme = getTheme();
  const [value, setValue] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Match slash commands for autocomplete hints
  const slashCommands = defaultCommandRegistry.getAll();
  const matchingCommand =
    value.startsWith('/') && !value.includes(' ')
      ? slashCommands.find((c) => `/${c.name}`.startsWith(value))
      : undefined;

  useInput(
    (input, key) => {
      if (disabled) return;

      // 1. Submit on Return
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

      // 2. Tab completion for slash command
      if (key.tab && matchingCommand) {
        const completed = `/${matchingCommand.name} `;
        setValue(completed);
        setCursorPos(completed.length);
        return;
      }

      // 3. Arrow Up (History previous)
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

      // 4. Arrow Down (History next)
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

      // 5. Backspace / Delete
      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          const before = value.slice(0, cursorPos - 1);
          const after = value.slice(cursorPos);
          setValue(before + after);
          setCursorPos(cursorPos - 1);
        }
        return;
      }

      // 6. Left / Right navigation
      if (key.leftArrow) {
        setCursorPos(Math.max(0, cursorPos - 1));
        return;
      }
      if (key.rightArrow) {
        setCursorPos(Math.min(value.length, cursorPos + 1));
        return;
      }

      // 7. Regular character input
      if (input && !key.ctrl && !key.meta) {
        const before = value.slice(0, cursorPos);
        const after = value.slice(cursorPos);
        setValue(before + input + after);
        setCursorPos(cursorPos + input.length);
      }
    },
    { isActive: !disabled },
  );

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Autocomplete suggestion banner */}
      {matchingCommand && value !== `/${matchingCommand.name} ` ? (
        <Box paddingLeft={2}>
          <Text dimColor>
            Tab to complete: <Text color={theme.permission}>/{matchingCommand.name}</Text> -{' '}
            {matchingCommand.description}
          </Text>
        </Box>
      ) : null}

      {/* Input box */}
      <Box
        borderStyle="round"
        borderColor={disabled ? theme.subtle : theme.promptBorder}
        paddingX={1}
      >
        <Text color={theme.brand}>{figures.pointer} </Text>
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
  );
};
