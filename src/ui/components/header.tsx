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
    <Box flexDirection="row" marginBottom={1} width="100%">
      {/* Left side: ANSI Unicode Logo */}
      <Box flexDirection="column" marginRight={2}>
        <Text color={theme.brand}> ▛███▜</Text>
        <Text color={theme.brand}>▛█████▜</Text>
        <Text color={theme.brand}> ▘▘ ▝▝</Text>
      </Box>

      {/* Right side: Title, Version, and Command hint */}
      <Box flexDirection="column" justifyContent="center">
        <Box flexDirection="row">
          <Text bold color={theme.brand}>
            xd
          </Text>
          <Text color={theme.permission}> v{version}</Text>
        </Box>
        <Box flexDirection="row">
          <Text dimColor>Type </Text>
          <Text color={theme.brand}>/</Text>
          <Text dimColor> for commands</Text>
        </Box>
      </Box>
    </Box>
  );
};
