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
    const firstPrompt = s.turns?.[0]?.userPrompt?.toLowerCase() ?? '';
    const name = s.name?.toLowerCase() ?? '';
    const id = s.id?.toLowerCase() ?? '';
    const date = s.date?.toLowerCase() ?? '';

    return id.includes(q) || date.includes(q) || name.includes(q) || firstPrompt.includes(q);
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

  // Calculate sliding window for pagination & smooth scrolling
  const visibleCount = 6;
  const startIdx = Math.max(
    0,
    Math.min(
      selectedIdx - Math.floor(visibleCount / 2),
      Math.max(0, filtered.length - visibleCount),
    ),
  );
  const visibleSessions = filtered.slice(startIdx, startIdx + visibleCount);

  return (
    <Box flexDirection="column" width="100%" marginTop={1}>
      <Text color={theme.lavenderHeader}>{figures.horizontalLine.repeat(dividerWidth)}</Text>

      <Box marginY={0} justifyContent="space-between" width="100%">
        <Text bold color={theme.lavenderLight}>
          Resume Session
        </Text>
        <Text dimColor>
          {filtered.length} session{filtered.length !== 1 ? 's' : ''}
        </Text>
      </Box>

      {/* Search Input bar */}
      <Box marginY={0} paddingLeft={1}>
        <Text color={theme.permission}>{figures.pointer} </Text>
        <Text color={theme.text}>{query}</Text>
        <Text inverse> </Text>
        {query.length === 0 ? <Text dimColor> Type to filter sessions…</Text> : null}
      </Box>

      <Text color={theme.dashedRule}>{figures.horizontalLine.repeat(dividerWidth)}</Text>

      {filtered.length === 0 ? (
        <Box marginY={1} paddingLeft={2}>
          <Text dimColor>No saved sessions matching "{query}".</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginY={0}>
          {visibleSessions.map((s, relativeIdx) => {
            const actualIdx = startIdx + relativeIdx;
            const isSelected = actualIdx === selectedIdx;
            const shortId = s.id.slice(0, 8);
            const firstMessage = s.turns?.[0]?.userPrompt || s.name || 'Untitled Session';

            // Available space calculation for clean single-line display
            const metaInfo = `${s.date} · ${s.turns.length} turns`;
            const maxTitleLen = Math.max(20, columns - metaInfo.length - 20);
            const displayTitle =
              firstMessage.length > maxTitleLen
                ? `${firstMessage.slice(0, maxTitleLen - 1)}…`
                : firstMessage;

            return (
              <Box key={s.id} flexDirection="row" justifyContent="space-between" width="100%">
                <Box flexDirection="row">
                  {isSelected ? (
                    <Text color={theme.lavenderLight}>{figures.pointer} </Text>
                  ) : (
                    <Text> </Text>
                  )}
                  <Text bold={isSelected} color={isSelected ? theme.text : theme.inactive}>
                    {displayTitle}
                  </Text>
                  <Text dimColor> ({shortId})</Text>
                </Box>
                <Box>
                  <Text dimColor>{metaInfo}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <Box marginTop={1} justifyContent="space-between" width="100%">
        <Text italic color={theme.textMuted}>
          ↑/↓ scroll · Enter to resume · Esc to cancel
        </Text>
        {filtered.length > visibleCount && (
          <Text dimColor>
            {selectedIdx + 1} of {filtered.length}
          </Text>
        )}
      </Box>
    </Box>
  );
};
