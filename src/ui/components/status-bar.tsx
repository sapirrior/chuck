import React from 'react';
import { Box, Text } from 'ink';
import type { TokenUsage } from '../../agent/types.js';
import { figures, getTheme } from '../theme/index.js';

export interface StatusBarProps {
  model: {
    provider: string;
    modelId: string;
  };
  usage: TokenUsage;
  isBusy: boolean;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  return `${n}`;
}

export const StatusBar: React.FC<StatusBarProps> = ({ model, usage, isBusy }) => {
  const theme = getTheme();

  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%" marginTop={1}>
      <Box>
        <Text dimColor>
          {isBusy ? (
            <Text color={theme.permission}>{figures.spinnerFrames[0]} processing...</Text>
          ) : (
            <>
              /model {figures.bullet} /clear {figures.bullet} Ctrl+C to exit
            </>
          )}
        </Text>
      </Box>

      <Box>
        <Text dimColor>
          tokens: in {formatTokens(usage.inputTokens)} / out {formatTokens(usage.outputTokens)}
        </Text>
      </Box>
    </Box>
  );
};
