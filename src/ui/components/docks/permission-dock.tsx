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

  // Parse diff if file edit tool
  let diffLines: DiffLine[] = [];
  if (request.toolName === 'edit_file' || request.toolName === 'write_file') {
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
        setReviewOffset((prev) => Math.min(Math.max(0, diffLines.length - 8), prev + 1));
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

  const visibleDiff = diffLines.slice(reviewOffset, reviewOffset + 10);

  return (
    <Box flexDirection="column" width="100%" marginTop={1}>
      <Text color={theme.lavenderHeader}>{figures.horizontalLine.repeat(dividerWidth)}</Text>

      <Box marginY={0}>
        <Text color={theme.lavenderLight}>
          Permission Required: {request.displayName}
        </Text>
      </Box>

      {request.promptTitle ? (
        <Box marginY={0}>
          <Text dimColor>{request.promptTitle}</Text>
        </Box>
      ) : null}

      {/* Diff or Argument preview */}
      {diffLines.length > 0 ? (
        <Box flexDirection="column" marginY={1}>
          <Text color={theme.dashedRule}>{figures.horizontalLine.repeat(dividerWidth)}</Text>
          {visibleDiff.map((line, idx) => {
            const lineNum = line.lineNumber ? `${line.lineNumber} ` : '';
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
                <Text dimColor>{lineNum.padStart(4)} </Text>
                <Text backgroundColor={lineBg} color={lineFg}>
                  {line.prefix} {line.text}
                </Text>
              </Box>
            );
          })}
          <Text color={theme.dashedRule}>{figures.horizontalLine.repeat(dividerWidth)}</Text>
        </Box>
      ) : request.args ? (
        <Box marginY={0} paddingLeft={2}>
          <Text dimColor>{JSON.stringify(request.args)}</Text>
        </Box>
      ) : null}

      <Box marginY={0}>
        <Text color={theme.text}>
          Do you want to proceed?
        </Text>
      </Box>

      {/* Selectable Options */}
      <Box flexDirection="column" marginY={1}>
        {options.map((opt, i) => {
          const isSelected = i === selectedIdx;
          return (
            <Box key={opt.key} flexDirection="row">
              {isSelected ? (
                <Text color={theme.info}>{figures.pointer} </Text>
              ) : (
                <Text>  </Text>
              )}
              <Text color={isSelected ? theme.info : theme.inactive}>
                {opt.key}. {opt.label}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={0}>
        <Text italic color={theme.textMuted}>
          {isReviewing
            ? 'f / Esc to return to options  ·  Enter to confirm  ·  ↑/↓ to scroll diff'
            : `Esc to cancel  ·  Enter to select${diffLines.length > 0 ? '  ·  f to review diff' : ''}`}
        </Text>
      </Box>
    </Box>
  );
};
