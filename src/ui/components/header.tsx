import React, { useState, useEffect } from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { figures, getTheme } from '../theme/index.js';

const execAsync = promisify(exec);

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
  const [gitBranch, setGitBranch] = useState<string>('');

  const dirName = cwd.split('/').filter(Boolean).pop() ?? cwd;
  const dividerWidth = Math.max(10, columns - 4);

  // Fetch current git branch
  useEffect(() => {
    let active = true;
    execAsync('git rev-parse --abbrev-ref HEAD', { cwd })
      .then(({ stdout }) => {
        if (active) {
          setGitBranch(stdout.trim());
        }
      })
      .catch(() => {
        if (active) {
          setGitBranch('');
        }
      });
    return () => {
      active = false;
    };
  }, [cwd]);

  return (
    <Box flexDirection="column" marginBottom={1} width="100%">
      {/* Top Banner Row */}
      <Box justifyContent="space-between" width="100%">
        <Box flexDirection="row" alignItems="center">
          <Text bold color={theme.brand}>
            xd
          </Text>
          <Text dimColor> v{version}</Text>
          <Text dimColor> {figures.bullet} </Text>
          <Text color={theme.text}>{dirName}</Text>
          {gitBranch ? (
            <>
              <Text dimColor> {figures.bullet} </Text>
              <Text color={theme.textMuted}>({gitBranch})</Text>
            </>
          ) : null}
        </Box>
        <Box flexDirection="row" alignItems="center">
          <Text color={theme.permission}>
            {model.provider}/{model.modelId}
          </Text>
        </Box>
      </Box>

      {/* Full-width Lavender Header Divider Rule */}
      <Box width="100%" marginTop={0}>
        <Text color={theme.lavenderHeader}>
          {figures.horizontalLine.repeat(dividerWidth)}
        </Text>
      </Box>
    </Box>
  );
};
