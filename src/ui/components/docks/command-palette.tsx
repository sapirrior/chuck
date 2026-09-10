import React from 'react';
import { Box, Text, useWindowSize } from 'ink';
import type { SlashCommand } from '../../../commands/types.js';
import { figures, getTheme } from '../../theme/index.js';

export interface CommandPaletteProps {
  commands: SlashCommand[];
  selectedIndex: number;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  commands,
  selectedIndex,
}) => {
  const theme = getTheme();
  const { columns } = useWindowSize();
  const dividerWidth = Math.max(10, columns - 4);

  return (
    <Box flexDirection="column" width="100%" marginTop={1}>
      <Text color={theme.lavenderHeader}>{figures.horizontalLine.repeat(dividerWidth)}</Text>
      <Box marginY={0}>
        <Text bold color={theme.lavenderLight}>
          Commands
        </Text>
      </Box>

      <Box flexDirection="column" marginY={1}>
        {commands.map((cmd, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box key={cmd.name} flexDirection="row">
              {isSelected ? (
                <Text color={theme.lavenderLight}>{figures.pointer} </Text>
              ) : (
                <Text>   </Text>
              )}
              <Text bold={isSelected} color={isSelected ? theme.text : theme.inactive}>
                /{cmd.name}
              </Text>
              <Text dimColor>  {cmd.description}</Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={0}>
        <Text italic color={theme.textMuted}>
          Enter select  ·  Esc dismiss  ·  ↑/↓ navigate
        </Text>
      </Box>
    </Box>
  );
};
