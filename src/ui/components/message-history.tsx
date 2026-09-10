import React from 'react';
import { Box, Text } from 'ink';
import { figures, getTheme } from '../theme/index.js';
import { ToolStatus, type ToolExecutionStatus } from './tool-status.js';
import { Markdown } from './markdown.js';

export interface UIHistoryItem {
  id: string;
  type: 'user' | 'assistant' | 'reasoning' | 'tool' | 'system' | 'bash';
  content: string;
  toolData?: {
    toolName: string;
    argsSummary?: string;
    status: ToolExecutionStatus;
    durationMs?: number;
    error?: string;
    toolOutput?: string;
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
    <Box flexDirection="column" width="100%">
      {items.map((item) => {
        switch (item.type) {
          case 'user':
            return (
              <Box
                key={item.id}
                marginTop={1}
                marginBottom={0}
                paddingX={1}
                backgroundColor={theme.userCardBg}
                flexDirection="row"
              >
                <Text color={theme.userChevron}>{figures.pointer} </Text>
                <Text color={theme.text}>{item.content}</Text>
              </Box>
            );

          case 'bash':
            return (
              <Box
                key={item.id}
                marginTop={1}
                marginBottom={0}
                paddingX={1}
                backgroundColor={theme.userCardBg}
                flexDirection="row"
              >
                <Text color={theme.bashPink}>! {item.content}</Text>
              </Box>
            );

          case 'reasoning':
            return (
              <Box key={item.id} marginY={0} paddingLeft={2}>
                <Text dimColor italic>
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
                toolOutput={item.toolData.toolOutput}
              />
            );

          case 'system':
            return (
              <Box key={item.id} marginY={0} paddingLeft={2}>
                <Text color={theme.permission}>
                  {figures.info} {item.content}
                </Text>
              </Box>
            );

          case 'assistant':
          default: {
            return (
              <Box key={item.id} marginY={0} flexDirection="column">
                <Markdown>{item.content}</Markdown>
              </Box>
            );
          }
        }
      })}

      {/* Real-time streaming reasoning */}
      {streamingReasoning ? (
        <Box marginY={0} paddingLeft={2}>
          <Text dimColor italic>
            {figures.teardropAsterisk} {streamingReasoning}
          </Text>
        </Box>
      ) : null}

      {/* Real-time streaming assistant text with structured Markdown formatting */}
      {streamingText ? (
        <Box marginY={0} flexDirection="column">
          <Markdown>{streamingText}</Markdown>
        </Box>
      ) : null}
    </Box>
  );
};
