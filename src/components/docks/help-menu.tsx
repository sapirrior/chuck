import React from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import { figures, getTheme } from '../../theme/index.js';

export interface HelpMenuProps {
  onClose?: () => void;
}

export const HelpMenu: React.FC<HelpMenuProps> = ({ onClose }) => {
  const theme = getTheme();
  const { columns } = useWindowSize();
  const dividerWidth = Math.max(10, columns - 4);

  useInput((_input, key) => {
    if (key.escape || key.return) {
      onClose?.();
    }
  });

  const col1 = ['! for bash mode', '/ for commands', '@ for file paths', '/resume for sessions'];

  const col2 = [
    'double tap esc to clear',
    'ctrl + c to cancel / exit',
    'pgup / pgdn to scroll',
    '\\ + enter for newline',
  ];

  const col3 = [
    '/model to change model',
    '/clear to clear context',
    '/new to start new session',
    '? for shortcuts',
  ];

  return (
    <Box flexDirection="column" width="100%" marginTop={1}>
      <Text color={theme.lavenderHeader}>{figures.horizontalLine.repeat(dividerWidth)}</Text>
      <Box marginY={0}>
        <Text color={theme.lavenderLight}>Shortcuts</Text>
      </Box>

      <Box flexDirection="column" marginY={1}>
        {col1.map((c1, i) => (
          <Box key={i} flexDirection="row" width="100%">
            <Box width="33%">
              <Text dimColor> {c1}</Text>
            </Box>
            <Box width="33%">
              <Text dimColor>{col2[i]}</Text>
            </Box>
            <Box width="33%">
              <Text dimColor>{col3[i]}</Text>
            </Box>
          </Box>
        ))}
      </Box>

      <Box marginTop={0}>
        <Text italic color={theme.textMuted}>
          Esc or Enter to dismiss
        </Text>
      </Box>
    </Box>
  );
};
