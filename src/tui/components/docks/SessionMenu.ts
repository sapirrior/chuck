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
      subtitle: `${props.sessions.length} session${props.sessions.length !== 1 ? 's' : ''}`,
      placeholder: 'Type to filter sessions…',
      emptyMessage: '  No saved sessions matching query.',
      maxVisible: 6,
      searchFilter: (s, q) => {
        const firstPrompt = s.turns?.[0]?.userPrompt?.toLowerCase() ?? '';
        const name = s.name?.toLowerCase() ?? '';
        const id = s.id?.toLowerCase() ?? '';
        const date = s.date?.toLowerCase() ?? '';
        return id.includes(q) || date.includes(q) || name.includes(q) || firstPrompt.includes(q);
      },
      onSelect: props.onSelect,
      onCancel: props.onCancel,
      renderItem: (s, isSelected, maxCols) => {
        const theme = getTheme();
        const infoColor = themeColor(theme.info);
        const shortId = s.id.slice(0, 8);
        const firstMessage = s.name || s.turns?.[0]?.userPrompt || 'Untitled Session';
        const metaInfo = `${s.date} · ${s.turns.length} turns`;
        const pointer = isSelected ? `${figures.pointer} ` : '  ';

        return Box({ direction: 'row', justify: 'space-between', width: maxCols }, [
          Text(`${pointer}${firstMessage} (${shortId})`, {
            color: isSelected ? infoColor : chalk.dim,
          }),
          Text(metaInfo, { dim: true }),
        ]);
      },
    });
  }
}
