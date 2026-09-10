import React from 'react';
import { Box, Text } from 'ink';
import { figures, getTheme } from '../../theme/index.js';

export interface FileMatchesProps {
  files: string[];
  selectedIndex: number;
}

export const FileMatches: React.FC<FileMatchesProps> = ({ files, selectedIndex }) => {
  const theme = getTheme();

  if (files.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={0} paddingLeft={1}>
      <Text dimColor>Matching files (@):</Text>
      {files.map((file, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box key={file} flexDirection="row">
            {isSelected ? (
              <Text color={theme.lavenderLight}>  {figures.pointer} </Text>
            ) : (
              <Text>    </Text>
            )}
            <Text bold={isSelected} color={isSelected ? theme.text : theme.inactive}>
              {file}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
