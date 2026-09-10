import React from 'react';
import { Box, Text } from 'ink';
import { figures, getTheme } from '../theme/index.js';

export type ToolExecutionStatus = 'running' | 'completed' | 'failed';

export interface ToolStatusProps {
  toolName: string;
  argsSummary?: string;
  status: ToolExecutionStatus;
  durationMs?: number;
  error?: string;
}

export const ToolStatus: React.FC<ToolStatusProps> = ({
  toolName,
  argsSummary,
  status,
  durationMs,
  error,
}) => {
  const theme = getTheme();

  let icon = <Text color={theme.permission}>{figures.spinnerFrames[0]}</Text>;
  let statusText = <Text color={theme.permission}>running...</Text>;

  if (status === 'completed') {
    icon = <Text color={theme.success}>{figures.tick}</Text>;
    statusText = <Text dimColor>{durationMs !== undefined ? `(${durationMs}ms)` : 'done'}</Text>;
  } else if (status === 'failed') {
    icon = <Text color={theme.error}>{figures.cross}</Text>;
    statusText = <Text color={theme.error}>{error ? `failed: ${error}` : 'failed'}</Text>;
  }

  return (
    <Box marginY={0} paddingLeft={1}>
      <Text color={theme.subtle}>{figures.blockquoteBar} </Text>
      {icon}
      <Text bold color={theme.text}>
        {' '}
        {toolName}
      </Text>
      {argsSummary ? <Text dimColor>({argsSummary})</Text> : null}
      <Text> {statusText}</Text>
    </Box>
  );
};
