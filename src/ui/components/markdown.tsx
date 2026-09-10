import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { applyMarkdown } from '../utils/markdown.js';

export interface MarkdownProps {
  children: string;
}

/**
 * 1:1 Claude Code Markdown component.
 * Renders complete ANSI-formatted markdown (headings, bold, italic, inline code,
 * blockquotes, ordered/unordered lists, tables, and highlighted code fences).
 */
export const Markdown: React.FC<MarkdownProps> = ({ children }) => {
  const rendered = useMemo(() => applyMarkdown(children), [children]);

  if (!rendered) return null;

  return (
    <Box flexDirection="column" marginY={0}>
      <Text>{rendered}</Text>
    </Box>
  );
};
