import { SelectList } from '../../primitives/index.js';
import type { SessionData } from '../../../session/types.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk } from '../../utils/format.js';
import { Box, Text } from '../../primitives/index.js';

export interface SessionMenuProps {
  sessions: SessionData[];
  onSelect: (session: SessionData) => void;
  onCancel: () => void;
}

export default class SessionMenu extends SelectList<SessionData> {
  constructor(props: SessionMenuProps) {
    super({
      items: props.sessions,
      title: 'Resume Session',
      subtitle: `${props.sessions.length} saved`,
      placeholder: 'Type to filter…',
      emptyMessage: '  No saved sessions found.',
      maxVisible: 6,
      searchFilter: (s, q) => {
        const firstPrompt = s.turns?.[0]?.userPrompt?.toLowerCase() ?? '';
        const name = s.name?.toLowerCase() ?? '';
        const id = s.id?.toLowerCase() ?? '';
        return id.includes(q) || name.includes(q) || firstPrompt.includes(q);
      },
      onSelect: props.onSelect,
      onCancel: props.onCancel,
      renderItem: (s, isSelected, maxCols) => {
        const theme = getTheme();
        const selColor = themeColor(theme.permission);
        const rawTitle = s.name || s.turns?.[0]?.userPrompt || 'Untitled Session';
        const cleanTitle = rawTitle.replace(/\s+/g, ' ').trim();
        const pointer = isSelected ? selColor(`${figures.pointer} `) : '  ';
        const turnsCount = s.turns?.length ?? 0;
        const meta = `${turnsCount} turn${turnsCount !== 1 ? 's' : ''}`;

        return Box({ direction: 'row', justify: 'space-between', width: maxCols }, [
          Text(`${pointer}${cleanTitle}`, {
            color: isSelected ? selColor : chalk.white,
            overflow: 'hidden',
            truncation: 'ellipsis',
          }),
          Text(meta, { dim: true }),
        ]);
      },
    });
  }
}
