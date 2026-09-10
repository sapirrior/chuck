import React from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { figures, getTheme } from '../theme/index.js';

export interface HeaderProps {
  version?: string;
  cwd: string;
  model: {
    provider: string;
    modelId: string;
  };
}

export const Header: React.FC<HeaderProps> = ({ version = '0.1.0', cwd, model }) => {
  const theme = getTheme();
  const { columns } = useWindowSize();
  const dirName = cwd.split('/').filter(Boolean).pop() ?? cwd;
  const dividerWidth = Math.max(10, columns - 4);

  return (
    <Box flexDirection="column" marginBottom={0} width="100%">
      <Box justifyContent="space-between" width="100%">
        <Box>
          <Text bold color={theme.brand}>
            xd
          </Text>
          <Text dimColor> v{version}</Text>
          <Text dimColor> {figures.bullet} </Text>
          <Text bold color={theme.text}>
            {dirName}
          </Text>
        </Box>
        <Box>
          <Text color={theme.permission}>
            {model.provider}/{model.modelId}
          </Text>
        </Box>
      </Box>
      <Box width="100%">
        <Text dimColor>{figures.horizontalLine.repeat(dividerWidth)}</Text>
      </Box>
    </Box>
  );
};

