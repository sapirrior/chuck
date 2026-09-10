import React from 'react';
import { Box, Text } from 'ink';
import { figures, getTheme } from '../theme/index.js';
import { ToolStatus, type ToolExecutionStatus } from './tool-status.js';

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
                <Text bold color={theme.text}>
                  {item.content}
                </Text>
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
                <Text bold color={theme.bashPink}>
                  ! {item.content}
                </Text>
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
            const lines = item.content.split('\n');
            const firstLine = lines[0] ?? '';
            const restLines = lines.slice(1);
            return (
              <Box key={item.id} marginY={0} flexDirection="column">
                <Box flexDirection="row">
                  <Text color={theme.text}>{figures.blackCircle} </Text>
                  <Text color={theme.text}>{firstLine}</Text>
                </Box>
                {restLines.length > 0 ? (
                  <Box paddingLeft={2} flexDirection="column">
                    {restLines.map((line, lIdx) => (
                      <Text key={lIdx} color={theme.text}>
                        {line}
                      </Text>
                    ))}
                  </Box>
                ) : null}
              </Box>
            );
          }
        }
      })}

      {/* Real-time streaming reasoning */}
      {streamingReasoning ? (
        <Box marginY={0} paddingLeft={2}>
          <Text color={theme.permission} italic>
            {figures.teardropAsterisk} {streamingReasoning}
          </Text>
        </Box>
      ) : null}

      {/* Real-time streaming assistant text with bullet */}
      {streamingText ? (
        <Box marginY={0} flexDirection="column">
          {(() => {
            const lines = streamingText.split('\n');
            const firstLine = lines[0] ?? '';
            const restLines = lines.slice(1);
            return (
              <>
                <Box flexDirection="row">
                  <Text color={theme.text}>{figures.blackCircle} </Text>
                  <Text color={theme.text}>{firstLine}</Text>
                </Box>
                {restLines.length > 0 ? (
                  <Box paddingLeft={2} flexDirection="column">
                    {restLines.map((line, lIdx) => (
                      <Text key={lIdx} color={theme.text}>
                        {line}
                      </Text>
                    ))}
                  </Box>
                ) : null}
              </>
            );
          })()}
        </Box>
      ) : null}
    </Box>
  );
};
