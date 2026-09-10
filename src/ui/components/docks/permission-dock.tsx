import React, { useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { ConfirmationDecision, ConfirmationRequest } from '../../../tools/types.js';
import { figures, getTheme } from '../../theme/index.js';
import { computeLineDiff, type DiffLine } from '../../utils/diff.js';

export interface PermissionDockProps {
  request: ConfirmationRequest;
  onDecision: (decision: ConfirmationDecision) => void;
}

export const PermissionDock: React.FC<PermissionDockProps> = ({ request, onDecision }) => {
  const theme = getTheme();
  const { columns } = useWindowSize();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewOffset, setReviewOffset] = useState(0);

  const dividerWidth = Math.max(10, columns - 4);

  // Parse diff for file operations
  let diffLines: DiffLine[] = [];
  const isFileOp = request.toolName === 'edit_file' || request.toolName === 'write_file';
  if (isFileOp) {
    const oldContent = (request.args as any)?.oldContent ?? '';
    const newContent = (request.args as any)?.newContent ?? (request.args as any)?.content ?? '';
    if (oldContent || newContent) {
      diffLines = computeLineDiff(oldContent, newContent);
    }
  }

  const options: Array<{ key: string; label: string; decision: ConfirmationDecision }> = [
    { key: '1', label: 'Yes', decision: 'allow_once' },
    { key: '2', label: 'Yes, allow for session', decision: 'allow_session' },
    { key: '3', label: 'No', decision: 'deny' },
  ];

  useInput((input, key) => {
    // Esc to cancel or exit review
    if (key.escape) {
      if (isReviewing) {
        setIsReviewing(false);
      } else {
        onDecision('deny');
      }
      return;
    }

    // Toggle diff review with 'f'
    if (input.toLowerCase() === 'f' && diffLines.length > 0) {
      setIsReviewing((prev) => !prev);
      return;
    }

    if (isReviewing) {
      if (key.upArrow) {
        setReviewOffset((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setReviewOffset((prev) => Math.min(Math.max(0, diffLines.length - 1), prev + 1));
        return;
      }
    }

    // Direct 1, 2, 3 selection
    if (input === '1') {
      onDecision('allow_once');
      return;
    }
    if (input === '2') {
      onDecision('allow_session');
      return;
    }
    if (input === '3' || input.toLowerCase() === 'n') {
      onDecision('deny');
      return;
    }
    if (input.toLowerCase() === 'y') {
      onDecision('allow_once');
      return;
    }
    if (input.toLowerCase() === 'a') {
      onDecision('allow_session');
      return;
    }

    // Arrow navigation
    if (key.upArrow) {
      setSelectedIdx((prev) => (prev > 0 ? prev - 1 : options.length - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIdx((prev) => (prev < options.length - 1 ? prev + 1 : 0));
      return;
    }

    // Return to select highlighted option
    if (key.return) {
      const selected = options[selectedIdx];
      if (selected) {
        onDecision(selected.decision);
      }
    }
  });

  // Calculate preview lines based on review mode (Delta standard: 8 lines in compact, 10 lines in review)
  const maxPreview = 8;
  const reviewWindowSize = 10;
  let visibleLines: DiffLine[] = [];

  if (isReviewing) {
    const start = Math.max(
      0,
      Math.min(reviewOffset, Math.max(0, diffLines.length - reviewWindowSize)),
    );
    visibleLines = diffLines.slice(start, start + reviewWindowSize);
  } else {
    visibleLines = diffLines.slice(0, maxPreview);
  }

  // Title formatting
  const title = `Permission Required: ${request.displayName}`;

  return (
    <Box flexDirection="column" width="100%" marginTop={1}>
      {/* Lavender top divider */}
      <Text color={theme.lavenderHeader}>{figures.horizontalLine.repeat(dividerWidth)}</Text>

      {/* Title */}
      <Box marginY={0}>
        <Text color={theme.lavenderLight}>{title}</Text>
      </Box>

      {/* Subtitle / Prompt title */}
      {request.promptTitle ? (
        <Box marginY={0}>
          <Text dimColor>{request.promptTitle}</Text>
        </Box>
      ) : null}

      {/* Preview Section */}
      {diffLines.length > 0 ? (
        <Box flexDirection="column" marginY={1}>
          <Text color={theme.dashedRule}>{figures.horizontalLine.repeat(dividerWidth)}</Text>
          {visibleLines.map((line, idx) => {
            const actualIdx = isReviewing
              ? Math.max(
                  0,
                  Math.min(reviewOffset, Math.max(0, diffLines.length - reviewWindowSize)),
                ) + idx
              : idx;
            const isCursorLine = isReviewing && actualIdx === reviewOffset;
            const lineNum = line.lineNumber ? `${line.lineNumber}`.padStart(3) : '   ';
            let lineBg: string | undefined = undefined;
            let lineFg = theme.text;
            if (line.kind === 'add') {
              lineBg = theme.diffAddBG;
              lineFg = theme.diffAddFG;
            } else if (line.kind === 'delete') {
              lineBg = theme.diffDeleteBG;
              lineFg = theme.diffDeleteFG;
            }

            return (
              <Box key={idx} flexDirection="row">
                <Text color={theme.lavenderLight}>{isCursorLine ? '> ' : '  '}</Text>
                <Text dimColor>
                  {lineNum} {line.prefix}{' '}
                </Text>
                <Text backgroundColor={lineBg} color={lineFg}>
                  {line.text}
                </Text>
              </Box>
            );
          })}
          {!isReviewing && diffLines.length > maxPreview ? (
            <Box paddingLeft={2}>
              <Text dimColor>
                ... ({diffLines.length - maxPreview} more lines, press &apos;f&apos; to review)
              </Text>
            </Box>
          ) : null}
          <Text color={theme.dashedRule}>{figures.horizontalLine.repeat(dividerWidth)}</Text>
        </Box>
      ) : request.toolName === 'run_command' && (request.args as any)?.command ? (
        <Box flexDirection="column" marginY={1}>
          <Text color={theme.dashedRule}>{figures.horizontalLine.repeat(dividerWidth)}</Text>
          <Box paddingLeft={2} flexDirection="row">
            <Text color={theme.bashPink}>$ </Text>
            <Text color={theme.text}>{(request.args as any).command}</Text>
          </Box>
          <Text color={theme.dashedRule}>{figures.horizontalLine.repeat(dividerWidth)}</Text>
        </Box>
      ) : isFileOp && !(request.args as any)?.content && !(request.args as any)?.newContent ? (
        <Box flexDirection="column" marginY={1}>
          <Text color={theme.dashedRule}>{figures.horizontalLine.repeat(dividerWidth)}</Text>
          <Box paddingLeft={2}>
            <Text dimColor italic>
              (empty file: create empty file at {(request.args as any)?.path ?? ''})
            </Text>
          </Box>
          <Text color={theme.dashedRule}>{figures.horizontalLine.repeat(dividerWidth)}</Text>
        </Box>
      ) : request.args && Object.keys(request.args).length > 0 ? (
        <Box flexDirection="column" marginY={1}>
          <Text color={theme.dashedRule}>{figures.horizontalLine.repeat(dividerWidth)}</Text>
          {Object.entries(request.args)
            .filter(([key]) => key !== 'oldContent' && key !== 'newContent' && key !== 'content')
            .map(([key, val]) => (
              <Box key={key} paddingLeft={2} flexDirection="row">
                <Text dimColor>{key}: </Text>
                <Text color={theme.text}>
                  {typeof val === 'string' ? val : JSON.stringify(val)}
                </Text>
              </Box>
            ))}
          <Text color={theme.dashedRule}>{figures.horizontalLine.repeat(dividerWidth)}</Text>
        </Box>
      ) : null}

      {/* Question */}
      <Box marginY={0}>
        <Text color={theme.text}>Do you want to proceed?</Text>
      </Box>

      {/* Selectable Options (1:1 Delta pointer and style) */}
      <Box flexDirection="column" marginY={1}>
        {options.map((opt, i) => {
          const isSelected = i === selectedIdx;
          return (
            <Box key={opt.key} flexDirection="row">
              {isSelected ? (
                <>
                  <Text color={theme.lavenderLight}>❯ </Text>
                  <Text color={theme.text}>
                    {opt.key}. {opt.label}
                  </Text>
                </>
              ) : (
                <Text dimColor>
                  {' '}
                  {opt.key}. {opt.label}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Footer hint */}
      <Box marginTop={0}>
        <Text italic color={theme.textMuted}>
          {isReviewing
            ? 'f / Esc to return to options  ·  Enter / 1-3 to confirm  ·  ↑/↓ to move line'
            : `Esc to cancel  ·  Enter to select${diffLines.length > 0 ? '  ·  f to review diff' : ''}`}
        </Text>
      </Box>
    </Box>
  );
};
