import React from 'react';
import { Box, Text } from 'ink';
import { getTheme, LOGO_LINES, LOGO_WIDTH } from '../theme/index.js';

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
    <Box flexDirection="row" marginBottom={1}>
      <Box flexDirection="column" width={LOGO_WIDTH} marginRight={1}>
        {LOGO_LINES.map((line, i) => (
          <Text key={i} color={theme.brand}>
            {line}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column">
        <Box>
          <Text bold color={theme.brand}>
            xd
          </Text>
          <Text color={theme.permission}> v{version}</Text>
        </Box>
        <Box>
          <Text dimColor>Type </Text>
          <Text color={theme.brand}>/</Text>
          <Text dimColor> for commands</Text>
        </Box>
      </Box>
    </Box>
  );
};
