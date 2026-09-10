import React, { useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { SessionData } from '../../../session/types.js';
import { figures, getTheme } from '../../theme/index.js';

export interface SessionMenuProps {
  sessions: SessionData[];
  onSelect: (session: SessionData) => void;
  onCancel: () => void;
}

export const SessionMenu: React.FC<SessionMenuProps> = ({ sessions, onSelect, onCancel }) => {
  const theme = getTheme();
  const { columns } = useWindowSize();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [query, setQuery] = useState('');

  const dividerWidth = Math.max(10, columns - 4);

  const filtered = sessions.filter((s) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return s.id.toLowerCase().includes(q) || s.date.toLowerCase().includes(q);
  });

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return && filtered.length > 0) {
      const chosen = filtered[selectedIdx];
      if (chosen) {
        onSelect(chosen);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIdx((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIdx((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
      return;
    }

    if (key.backspace || key.delete) {
      setQuery((prev) => prev.slice(0, -1));
      setSelectedIdx(0);
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setQuery((prev) => prev + input);
      setSelectedIdx(0);
    }
  });

  return (
    <Box flexDirection="column" width="100%" marginTop={1}>
      <Text color={theme.lavenderHeader}>{figures.horizontalLine.repeat(dividerWidth)}</Text>

      <Box marginY={0}>
        <Text bold color={theme.lavenderLight}>
          Resume Session
        </Text>
      </Box>

      {/* Search Input bar */}
      <Box marginY={0} paddingLeft={1}>
        <Text dimColor>⌕ </Text>
        <Text color={theme.text}>{query || 'Search sessions…'}</Text>
      </Box>

      <Text color={theme.dashedRule}>{figures.horizontalLine.repeat(dividerWidth)}</Text>

      {filtered.length === 0 ? (
        <Box marginY={1} paddingLeft={2}>
          <Text dimColor>No saved sessions found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginY={1}>
          {filtered.slice(0, 6).map((s, i) => {
            const isSelected = i === selectedIdx;
            const shortId = s.id.slice(0, 8);
            return (
              <Box key={s.id} flexDirection="column" marginBottom={0}>
                <Box flexDirection="row">
                  {isSelected ? (
                    <Text color={theme.lavenderLight}>{figures.pointer} </Text>
                  ) : (
                    <Text> </Text>
                  )}
                  <Text bold={isSelected} color={isSelected ? theme.text : theme.inactive}>
                    session {shortId}
                  </Text>
                </Box>
                <Box paddingLeft={3}>
                  <Text dimColor>
                    {s.date} · {s.turns.length} turns · {s.model.provider}/{s.model.modelId}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <Box marginTop={0}>
        <Text italic color={theme.textMuted}>
          Type to search · Enter to select · Esc to cancel
        </Text>
      </Box>
    </Box>
  );
};
