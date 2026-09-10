import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { ConfirmationDecision, ConfirmationRequest } from '../../tools/types.js';
import { figures, getTheme } from '../theme/index.js';

export interface ConfirmationModalProps {
  request: ConfirmationRequest;
  onDecision: (decision: ConfirmationDecision) => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ request, onDecision }) => {
  const theme = getTheme();

  useInput((input, key) => {
    const lower = input.toLowerCase();
    if (lower === 'y' || key.return) {
      onDecision('allow_once');
    } else if (lower === 'a') {
      onDecision('allow_session');
    } else if (lower === 'n' || key.escape) {
      onDecision('deny');
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.warning}
      paddingX={1}
      paddingY={0}
      marginY={1}
    >
      <Box>
        <Text bold color={theme.warning}>
          {figures.warning} Permission Required
        </Text>
      </Box>

      <Box marginY={0}>
        <Text color={theme.text}>
          {request.promptTitle ?? `Allow ${request.displayName} to execute?`}
        </Text>
      </Box>

      {request.args ? (
        <Box marginY={0} paddingLeft={1}>
          <Text dimColor>Arguments: {JSON.stringify(request.args, null, 2)}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color={theme.success}>[y] Allow once</Text>
        <Text dimColor> {figures.bullet} </Text>
        <Text color={theme.permission}>[a] Allow for session</Text>
        <Text dimColor> {figures.bullet} </Text>
        <Text color={theme.error}>[n] Deny</Text>
      </Box>
    </Box>
  );
};
