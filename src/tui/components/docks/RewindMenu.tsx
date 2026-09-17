import { SelectList } from '../../primitives/index.js';
import type { SessionData, SessionTurn } from '../../../session/types.js';
import { loadCheckpointManifest } from '../../../checkpoint/store.js';
import { computeWorkspaceHash } from '../../../checkpoint/path.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk } from '../../utils/format.js';
import { Box, Text } from '../../primitives/index.js';

export interface RewindItem {
  turnId: string;
  turnIndex: number;
  promptText: string;
  hasCodeChanges: boolean;
  changedFileCount: number;
}

export interface RewindMenuProps {
  session: SessionData;
  cwd: string;
  onSelect: (item: RewindItem) => void;
  onCancel: () => void;
}

export function buildRewindItems(session: SessionData, cwd: string): RewindItem[] {
  const workspaceHash = computeWorkspaceHash(cwd);
  const manifest = loadCheckpointManifest(workspaceHash, session.id);
  const sidecarMap = new Map(manifest?.turns.map((t) => [t.turnId, t]) ?? []);

  const turns = session.turns ?? [];
  return turns.map((turn: SessionTurn, idx: number) => {
    const userMsg = turn.messages.find((m) => m.role === 'user');
    let promptText = 'Prompt';
    if (userMsg) {
      if (typeof userMsg.content === 'string') {
        promptText = userMsg.content;
      } else if (Array.isArray(userMsg.content)) {
        promptText = userMsg.content
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join(' ');
      }
    }
    const cleanPrompt = promptText.replace(/\s+/g, ' ').trim();

    const cp = sidecarMap.get(turn.id);
    const committedFiles = cp?.files?.filter((f) => f.mutationCommitted) ?? [];
    const changedFileCount = committedFiles.length;
    const hasCodeChanges = changedFileCount > 0;

    return {
      turnId: turn.id,
      turnIndex: idx,
      promptText: cleanPrompt || `Turn ${idx + 1}`,
      hasCodeChanges,
      changedFileCount,
    };
  });
}

export default class RewindMenu extends SelectList<RewindItem> {
  constructor(props: RewindMenuProps) {
    const items = buildRewindItems(props.session, props.cwd);

    super({
      items,
      title: 'Rewind',
      subtitle: 'Restore code and conversation to before selected turn',
      placeholder: 'Type to filter turns…',
      emptyMessage: '  No rewind points found.',
      maxVisible: 4,
      searchFilter: (item, q) => {
        return item.promptText.toLowerCase().includes(q) || String(item.turnIndex + 1).includes(q);
      },
      onSelect: props.onSelect,
      onCancel: props.onCancel,
      renderItem: (item, isSelected, maxCols) => {
        const theme = getTheme();
        const selColor = themeColor(theme.permission);
        const pointer = isSelected ? selColor(`${figures.pointer} `) : '  ';

        const changeSummary = item.hasCodeChanges
          ? `${item.changedFileCount} file${item.changedFileCount !== 1 ? 's' : ''} changed`
          : 'No code changes';

        return (
          <Box direction="column" width={maxCols}>
            <Text
              color={isSelected ? selColor : chalk.white}
              wrap={false}
              clip={true}
              ellipsis={true}
            >
              {`${pointer}${item.promptText}`}
            </Text>
            <Text dim={true} wrap={false} clip={true} ellipsis={true}>
              {`  ${changeSummary}`}
            </Text>
          </Box>
        );
      },
    });
  }
}
