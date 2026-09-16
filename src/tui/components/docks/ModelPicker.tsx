import { SelectList } from '../../primitives/index.js';
import type { ModelDescriptor } from '../../../models/discovery.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk } from '../../utils/format.js';
import { Box, Text } from '../../primitives/index.js';

export interface ModelPickerProps {
  models: ModelDescriptor[];
  currentModel: { provider: string; modelId: string };
  onSelect: (model: ModelDescriptor) => void;
  onCancel: () => void;
}

export default class ModelPicker extends SelectList<ModelDescriptor> {
  constructor(props: ModelPickerProps) {
    super({
      items: props.models,
      title: 'Select Model',
      subtitle: `Current: ${props.currentModel.provider}/${props.currentModel.modelId}`,
      placeholder: 'Type to filter models…',
      emptyMessage: '  No models matching query.',
      searchFilter: (m, q) =>
        m.model_id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
      onSelect: props.onSelect,
      onCancel: props.onCancel,
      renderItem: (m, isSelected, maxCols) => {
        const theme = getTheme();
        const selColor = themeColor(theme.permission);
        const isCurrent =
          m.provider === props.currentModel.provider && m.model_id === props.currentModel.modelId;

        const pointer = isSelected ? selColor(`${figures.pointer} `) : '  ';
        const activeBadge = isCurrent ? chalk.green(' (active)') : '';
        const badge = `[${m.provider.toUpperCase()}]`;

        return (
          <Box direction="row" justify="space-between" width={maxCols}>
            <Text color={isSelected ? selColor : chalk.white}>
              {`${pointer}${m.model_id}${activeBadge}`}
            </Text>
            <Text dim={true}>{badge}</Text>
          </Box>
        );
      },
    });
  }
}
