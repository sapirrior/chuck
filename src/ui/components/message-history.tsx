import React from 'react';
import { Box, Text } from 'ink';
import { figures, getTheme } from '../theme/index.js';
import { ToolStatus, type ToolExecutionStatus } from './tool-status.js';

export interface UIHistoryItem {
  id: string;
  type: 'user' | 'assistant' | 'reasoning' | 'tool' | 'system';
  content: string;
  toolData?: {
    toolName: string;
    argsSummary?: string;
    status: ToolExecutionStatus;
    durationMs?: number;
    error?: string;
  };
}

export interface MessageHistoryProps {
  items: UIHistoryItem[];
  streamingReasoning?: string;
  streamingText?: string;
}

export const MessageHistory: React.FC<MessageHistoryProps> = ({
  items,
  streamingReasoning,
  streamingText,
}) => {
  const theme = getTheme();

  return (
    <Box flexDirection="column">
      {items.map((item) => {
        switch (item.type) {
          case 'user':
            return (
              <Box key={item.id} marginY={0} flexDirection="row">
                <Text bold color={theme.brand}>
                  {figures.blackCircle} You:
                </Text>
                <Text color={theme.text}> {item.content}</Text>
              </Box>
            );

          case 'reasoning':
            return (
              <Box key={item.id} marginY={0} paddingLeft={1}>
                <Text dimColor>
                  {figures.teardropAsterisk} {item.content}
                </Text>
              </Box>
            );

          case 'tool':
            if (!item.toolData) return null;
            return (
              <ToolStatus
                key={item.id}
                toolName={item.toolData.toolName}
                argsSummary={item.toolData.argsSummary}
                status={item.toolData.status}
                durationMs={item.toolData.durationMs}
                error={item.toolData.error}
              />
            );

          case 'system':
            return (
              <Box key={item.id} marginY={0} paddingLeft={1}>
                <Text color={theme.permission}>
                  {figures.info} {item.content}
                </Text>
              </Box>
            );

          case 'assistant':
          default:
            return (
              <Box key={item.id} marginY={0} paddingLeft={1} flexDirection="column">
                <Text color={theme.text}>{item.content}</Text>
              </Box>
            );
        }
      })}

      {/* Real-time streaming reasoning */}
      {streamingReasoning ? (
        <Box marginY={0} paddingLeft={1}>
          <Text color={theme.permission}>
            {figures.teardropAsterisk} {streamingReasoning}
          </Text>
        </Box>
      ) : null}

      {/* Real-time streaming assistant text */}
      {streamingText ? (
        <Box marginY={0} paddingLeft={1}>
          <Text color={theme.text}>{streamingText}</Text>
        </Box>
      ) : null}
    </Box>
  );
};
