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
 * Clean, minimal welcome banner matching Delta's exact RenderBanner:
 * Line 1: xd v0.1.0
 * Line 2: Type / for commands
 * (No horizontal divider rule)
 */
export const Header: React.FC<HeaderProps> = ({ version = '0.1.0' }) => {
  const theme = getTheme();

  return (
    <Box flexDirection="column" marginBottom={1} width="100%">
      {/* Line 1: Title and Version */}
      <Box flexDirection="row">
        <Text bold color={theme.brand}>
          xd
        </Text>
        <Text color={theme.permission}> v{version}</Text>
      </Box>

      {/* Line 2: Type / for commands */}
      <Box flexDirection="row">
        <Text dimColor>Type </Text>
        <Text color={theme.brand}>/</Text>
        <Text dimColor> for commands</Text>
      </Box>
    </Box>
  );
};
