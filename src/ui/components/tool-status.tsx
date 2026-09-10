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
  toolOutput?: string;
}

function formatToolDisplayName(name: string): string {
  switch (name.toLowerCase()) {
    case 'run_command':
      return 'Bash';
    case 'write_file':
      return 'Write';
    case 'edit_file':
      return 'Update';
    case 'read_file':
      return 'Read';
    case 'list_dir':
      return 'List';
    case 'search_text':
      return 'Search';
    case 'find':
      return 'Find';
    case 'web_fetch':
      return 'Web';
    case 'schedule':
      return 'Schedule';
    default:
      return name.length > 0 ? name[0]!.toUpperCase() + name.slice(1) : name;
  }
}

/**
 * Tool status bullet matching Delta / Claude Code 1:1:
 * - Completed: ● SuccessGreen Name(arg)
 * - Failed: ✕ ErrorRed Name(arg)
 * - Running: ◉ InfoBlue Name(arg)
 * - Output summary with tree elbow (└)
 */
export const ToolStatus: React.FC<ToolStatusProps> = ({
  toolName,
  argsSummary,
  status,
  error,
  toolOutput,
}) => {
  const theme = getTheme();
  const dispName = formatToolDisplayName(toolName);

  let icon = <Text color={theme.permission}>{figures.effortMax} </Text>;
  if (status === 'completed') {
    icon = <Text color={theme.success}>{figures.effortHigh} </Text>;
  } else if (status === 'failed') {
    icon = <Text color={theme.error}>{figures.cross} </Text>;
  }

  // Format primary single-line argument
  let cleanArg = '';
  if (argsSummary) {
    try {
      const parsed = JSON.parse(argsSummary);
      const primaryKeys = ['path', 'file_path', 'target_file', 'command', 'url', 'query', 'pattern'];
      for (const k of primaryKeys) {
        if (parsed[k]) {
          cleanArg = String(parsed[k]);
          break;
        }
      }
      if (!cleanArg && Object.values(parsed)[0]) {
        cleanArg = String(Object.values(parsed)[0]);
      }
    } catch {
      cleanArg = argsSummary;
    }
  }

  if (cleanArg.length > 36) {
    cleanArg = cleanArg.slice(0, 35) + '…';
  }

  return (
    <Box flexDirection="column" marginY={0}>
      <Box flexDirection="row">
        {icon}
        <Text color={theme.text}>{dispName}</Text>
        {cleanArg ? (
          <>
            <Text dimColor>(</Text>
            <Text dimColor>{cleanArg}</Text>
            <Text dimColor>)</Text>
          </>
        ) : null}
      </Box>

      {error ? (
        <Box paddingLeft={2} flexDirection="row">
          <Text color={theme.textMuted}>└ </Text>
          <Text color={theme.error}>{error}</Text>
        </Box>
      ) : toolOutput ? (
        <Box paddingLeft={2} flexDirection="row">
          <Text color={theme.textMuted}>└ </Text>
          <Text dimColor>{toolOutput}</Text>
        </Box>
      ) : null}
    </Box>
  );
};
