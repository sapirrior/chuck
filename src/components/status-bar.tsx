import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { TokenUsage } from '../engine/types.js';
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
  if (n < 0) return '0';
  if (n >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toFixed(1)}B`;
  }
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return `${n}`;
}

/**
 * Bottom status line matching Delta's exact RenderStatusLine layout:
 * - Left: "? for shortcuts" in muted text (or "▸ Press Ctrl+C again to exit" if quit hint)
 * - Right: Active model name in dim text (with optional token counters)
 */
export const StatusBar: React.FC<StatusBarProps> = ({ model, usage, exitPending }) => {
  const theme = getTheme();

  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%" paddingX={1} marginTop={0}>
      {/* Left side: Shortcuts hint or exit hint */}
      <Box>
        {exitPending ? (
          <Box flexDirection="row">
            <Text color={theme.error}> ▸ </Text>
            <Text dimColor>Press </Text>
            <Text color={theme.error}>Ctrl+C</Text>
            <Text dimColor> again to exit</Text>
          </Box>
        ) : (
          <Text color={theme.textMuted}>? for shortcuts</Text>
        )}
      </Box>

      {/* Right side: Active model name & compact token counters */}
      <Box flexDirection="row">
        <Text dimColor>{model.modelId || `${model.provider}/${model.modelId}`}</Text>
        {usage.totalTokens > 0 ? (
          <>
            <Text color={theme.subtle}> {figures.bullet} </Text>
            <Text color={theme.textMuted}>{formatTokens(usage.totalTokens)} tokens</Text>
          </>
        ) : null}
      </Box>
    </Box>
  );
};
