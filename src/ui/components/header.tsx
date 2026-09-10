import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../theme/index.js';

export interface HeaderProps {
  version?: string;
  cwd?: string;
  model?: {
    provider: string;
    modelId: string;
  };
}

/**
 * Header component featuring the unicode ANSI art logo alongside xd title, version,
 * and quick-start command hint.
 */
export const Header: React.FC<HeaderProps> = ({ version = '0.1.0' }) => {
  const theme = getTheme();

  return (
    <Box flexDirection="column" marginBottom={1} width="100%">
      {/* Line 1: Top of logo + Title & Version */}
      <Box flexDirection="row">
        <Text color={theme.brand}> ▛███▜ </Text>
        <Text bold color={theme.brand}>
          xd
        </Text>
        <Text color={theme.permission}> v{version}</Text>
      </Box>

      {/* Line 2: Middle of logo with straight horizontal hand part */}
      <Box flexDirection="row">
        <Text color={theme.brand}>▀█████▀ </Text>
        <Text dimColor>Type </Text>
        <Text color={theme.brand}>/</Text>
        <Text dimColor> for commands</Text>
      </Box>

      {/* Line 3: Bottom of logo */}
      <Box flexDirection="row">
        <Text color={theme.brand}> ▘▘ ▝▝ </Text>
      </Box>
    </Box>
  );
};
