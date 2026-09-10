import React, { useState, useMemo } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { ModelDescriptor } from '../../../models/discovery.js';
import { figures, getTheme } from '../../theme/index.js';

export interface ModelPickerProps {
  models: ModelDescriptor[];
  currentModel: { provider: string; modelId: string };
  onSelect: (model: ModelDescriptor) => void;
  onCancel: () => void;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  models,
  currentModel,
  onSelect,
  onCancel,
}) => {
  const theme = getTheme();
  const { columns } = useWindowSize();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [query, setQuery] = useState('');

  const dividerWidth = Math.max(10, columns - 4);

  const filtered = useMemo(() => {
    if (!query) return models;
    const q = query.toLowerCase();
    return models.filter(
      (m) => m.model_id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
    );
  }, [models, query]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return && filtered.length > 0) {
      const chosen = filtered[selectedIdx];
      if (chosen) {
        onSelect(chosen);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIdx((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIdx((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
      return;
    }

    if (key.backspace || key.delete) {
      setQuery((prev) => prev.slice(0, -1));
      setSelectedIdx(0);
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setQuery((prev) => prev + input);
      setSelectedIdx(0);
    }
  });

  // Calculate sliding window for pagination
  const visibleCount = 8;
  const startIdx = Math.max(
    0,
    Math.min(selectedIdx - Math.floor(visibleCount / 2), filtered.length - visibleCount),
  );
  const visibleModels = filtered.slice(Math.max(0, startIdx), startIdx + visibleCount);

  return (
    <Box flexDirection="column" width="100%" marginTop={1}>
      <Text color={theme.lavenderHeader}>{figures.horizontalLine.repeat(dividerWidth)}</Text>

      <Box marginY={0} justifyContent="space-between" width="100%">
        <Text color={theme.info}>Select Model</Text>
        <Text dimColor>
          Current: {currentModel.provider}/{currentModel.modelId}
        </Text>
      </Box>

      {/* Search Filter Box */}
      <Box marginY={0} paddingLeft={1}>
        <Text color={theme.info}>{figures.pointer} </Text>
        <Text color={theme.text}>{query}</Text>
        <Text inverse> </Text>
        {query.length === 0 ? <Text dimColor> Type to filter models…</Text> : null}
      </Box>

      <Text color={theme.dashedRule}>{figures.horizontalLine.repeat(dividerWidth)}</Text>

      {filtered.length === 0 ? (
        <Box marginY={1} paddingLeft={2}>
          <Text dimColor>No models matching "{query}".</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginY={0}>
          {visibleModels.map((m, relativeIdx) => {
            const actualIdx = Math.max(0, startIdx) + relativeIdx;
            const isSelected = actualIdx === selectedIdx;
            const isCurrent =
              m.provider === currentModel.provider && m.model_id === currentModel.modelId;

            let providerBadge = `[${m.provider.toUpperCase()}]`;
            if (m.provider === 'anthropic') providerBadge = '[ANTHROPIC]';
            if (m.provider === 'openai') providerBadge = '[OPENAI]';
            if (m.provider === 'gemini') providerBadge = '[GEMINI]';

            return (
              <Box
                key={`${m.provider}-${m.model_id}`}
                flexDirection="row"
                justifyContent="space-between"
                width="100%"
              >
                <Box flexDirection="row">
                  {isSelected ? <Text color={theme.info}>{figures.pointer} </Text> : <Text> </Text>}
                  <Text color={isSelected ? theme.info : theme.inactive}>{m.model_id}</Text>
                  {isCurrent ? <Text color={theme.success}> (active)</Text> : null}
                </Box>
                <Box>
                  <Text dimColor>{providerBadge}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <Box marginTop={1} justifyContent="space-between" width="100%">
        <Text italic color={theme.textMuted}>
          ↑/↓ navigate · Enter to select · Esc to cancel
        </Text>
        <Text dimColor>
          {filtered.length} model{filtered.length !== 1 ? 's' : ''} available
        </Text>
      </Box>
    </Box>
  );
};
