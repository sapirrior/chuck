import React from 'react';
import { Box, Text } from 'ink';
import { figures, getTheme } from '../theme/index.js';

export type ToolExecutionStatus = 'running' | 'completed' | 'failed';

export interface ToolStatusProps {
  toolName: string;
  displayName?: string;
  icon?: string;
  argsSummary?: string;
  status: ToolExecutionStatus;
  durationMs?: number;
  error?: string;
  toolOutput?: string;
}

/**
 * Truncates long text in the middle with an ellipsis: "start...end"
 */
function truncateMiddle(text: string, maxLength = 36): string {
  if (!text || text.length <= maxLength) return text;
  const leftChars = Math.floor((maxLength - 1) / 2);
  const rightChars = Math.ceil((maxLength - 1) / 2);
  return `${text.slice(0, leftChars)}…${text.slice(text.length - rightChars)}`;
}

/**
 * Tool status bullet matching Delta / Claude Code 1:1:
 * - Always uses ● (GlyphBullet) or custom icon with distinct status colors:
 *   - Success: ColorBulletSuccess (#4BB963)
 *   - Error: ColorBulletError (#9F525C)
 *   - Running: ColorInfoBlue (#7BA5DA)
 * - Single-line Name(arg) with middle-truncation for long args
 * - Multiline / status summary indented under tree elbow (└ )
 */
export const ToolStatus: React.FC<ToolStatusProps> = ({
  toolName,
  displayName,
  icon,
  argsSummary,
  status,
  error,
  toolOutput,
}) => {
  const theme = getTheme();
  const dispName =
    displayName ||
    (toolName.length > 0 ? toolName[0]!.toUpperCase() + toolName.slice(1) : toolName);
  const bulletGlyph = icon || figures.blackCircle;

  let bulletColor = theme.bulletRunning;
  if (status === 'completed') {
    bulletColor = theme.bulletSuccess;
  } else if (status === 'failed') {
    bulletColor = theme.bulletError;
  }

  // Extract primary single-line argument
  let rawArg = '';
  if (argsSummary) {
    try {
      const parsed = JSON.parse(argsSummary);
      const primaryKeys = [
        'path',
        'file_path',
        'target_file',
        'command',
        'url',
        'query',
        'pattern',
        'name',
        'prompt',
      ];
      for (const k of primaryKeys) {
        if (parsed[k]) {
          rawArg = String(parsed[k]);
          break;
        }
      }
      if (!rawArg && Object.values(parsed)[0]) {
        rawArg = String(Object.values(parsed)[0]);
      }
    } catch {
      rawArg = argsSummary;
    }
  }

  const cleanFirstLine = rawArg.split('\n')[0] ?? '';
  const truncatedArg = truncateMiddle(cleanFirstLine, 36);

  return (
    <Box flexDirection="column" marginY={0}>
      {/* Primary Log Line: ● Name(arg) */}
      <Box flexDirection="row">
        <Text color={bulletColor}>{bulletGlyph} </Text>
        <Text color={theme.text}>{dispName}</Text>
        {truncatedArg ? (
          <>
            <Text dimColor>(</Text>
            <Text dimColor wrap="truncate-middle">
              {truncatedArg}
            </Text>
            <Text dimColor>)</Text>
          </>
        ) : null}
      </Box>

      {/* Multiline output / error under Tree Elbow (└ ) */}
      {error ? (
        <Box paddingLeft={2} flexDirection="row">
          <Text color={theme.textMuted}>└ </Text>
          <Text
            color={
              error.toLowerCase().includes('interrupted') ||
              error.toLowerCase().includes('declined') ||
              error.toLowerCase().includes('cancelled')
                ? theme.textMuted
                : theme.error
            }
            wrap="truncate-middle"
          >
            {error.toLowerCase().includes('interrupted') ||
            error.toLowerCase().includes('declined') ||
            error.toLowerCase().includes('cancelled')
              ? 'Interrupted · What should xd do instead?'
              : error}
          </Text>
        </Box>
      ) : toolOutput ? (
        <Box paddingLeft={2} flexDirection="row">
          <Text color={theme.textMuted}>└ </Text>
          <Text dimColor wrap="truncate-middle">
            {toolOutput}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
};
