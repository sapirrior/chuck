import React, { useState, useEffect } from 'react';
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
  exitPending?: boolean;
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

export const StatusBar: React.FC<StatusBarProps> = ({ model, usage, isBusy, exitPending }) => {
  const theme = getTheme();
  const [spinnerIndex, setSpinnerIndex] = useState(0);

  // Animate spinner when generating
  useEffect(() => {
    if (!isBusy) return;
    const interval = setInterval(() => {
      setSpinnerIndex((prev) => (prev + 1) % figures.spinnerFrames.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isBusy]);

  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%" marginTop={1}>
      <Box>
        {exitPending ? (
          <Text color={theme.error}>Press Ctrl+C again to exit</Text>
        ) : isBusy ? (
          <Text color={theme.permission}>
            {figures.spinnerFrames[spinnerIndex]} processing... <Text dimColor>(Esc to stop)</Text>
          </Text>
        ) : (
          <Text dimColor>
            /model {figures.bullet} /clear {figures.bullet} Esc to clear {figures.bullet} 2x Ctrl+C
            to exit
          </Text>
        )}
      </Box>

      <Box>
        <Text dimColor>
          tokens: in {formatTokens(usage.inputTokens)} / out {formatTokens(usage.outputTokens)}
        </Text>
      </Box>
    </Box>
  );
};
