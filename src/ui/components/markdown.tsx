import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { applyMarkdown } from '../utils/markdown.js';

export interface MarkdownProps {
  children: string;
  withBullet?: boolean;
}

/**
 * Delta & Claude Code style Markdown component.
 * Renders complete ANSI-formatted markdown with optional Delta-style bullet prefix on line 1
 * and clean 2-space hanging indentation on subsequent lines.
 */
export const Markdown: React.FC<MarkdownProps> = ({ children, withBullet = true }) => {
  const rendered = useMemo(() => applyMarkdown(children), [children]);

  if (!rendered) return null;

  if (!withBullet) {
    return (
      <Box flexDirection="column" marginY={0}>
        <Text>{rendered}</Text>
      </Box>
    );
  }

  const lines = rendered.split('\n');
  const firstLine = lines[0] ?? '';
  const restLines = lines.slice(1);

  return (
    <Box flexDirection="column" marginY={0}>
      <Box flexDirection="row">
        <Text color="white">● </Text>
        <Text>{firstLine}</Text>
      </Box>
      {restLines.length > 0 ? (
        <Box flexDirection="column" paddingLeft={2}>
          {restLines.map((line, idx) => (
            <Text key={idx}>{line}</Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
};
