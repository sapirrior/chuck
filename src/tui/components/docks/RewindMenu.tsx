import { SelectList } from '../../primitives/index.js';
import type { SessionData, SessionTurn } from '../../../session/types.js';
import { loadCheckpointManifest } from '../../../checkpoint/store.js';
import { readCasBlob } from '../../../checkpoint/cas.js';
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
  addedLines: number;
  deletedLines: number;
}

export interface RewindMenuProps {
  session: SessionData;
  cwd: string;
  onSelect: (item: RewindItem) => void;
  onCancel: () => void;
}

export function computeLineDiffCounts(
  oldText: string,
  newText: string,
): { added: number; deleted: number } {
  if (oldText === newText) return { added: 0, deleted: 0 };

  const oldLines = oldText.length > 0 ? oldText.split('\n') : [];
  const newLines = newText.length > 0 ? newText.split('\n') : [];

  if (oldLines.length === 0) return { added: newLines.length, deleted: 0 };
  if (newLines.length === 0) return { added: 0, deleted: oldLines.length };

  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  ) {
    start++;
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  const trimmedOld = oldLines.slice(start, oldEnd + 1);
  const trimmedNew = newLines.slice(start, newEnd + 1);

  if (trimmedOld.length === 0) return { added: trimmedNew.length, deleted: 0 };
  if (trimmedNew.length === 0) return { added: 0, deleted: trimmedOld.length };

  const m = trimmedOld.length;
  const n = trimmedNew.length;
  let prev = new Array(n + 1).fill(0);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (trimmedOld[i - 1] === trimmedNew[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    const temp = prev;
    prev = curr;
    curr = temp;
    curr.fill(0);
  }

  const lcs = prev[n];
  return {
    added: trimmedNew.length - lcs,
    deleted: trimmedOld.length - lcs,
  };
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

    let addedLines = 0;
    let deletedLines = 0;

    if (hasCodeChanges) {
      for (const f of committedFiles) {
        try {
          const oldContent =
            f.pre.kind === 'file' ? readCasBlob(workspaceHash, f.pre.sha256).toString('utf-8') : '';
          const newContent =
            f.post && f.post.kind === 'file'
              ? readCasBlob(workspaceHash, f.post.sha256).toString('utf-8')
              : '';

          const diff = computeLineDiffCounts(oldContent, newContent);
          addedLines += diff.added;
          deletedLines += diff.deleted;
        } catch {}
      }
    }

    return {
      turnId: turn.id,
      turnIndex: idx,
      promptText: cleanPrompt || `Turn ${idx + 1}`,
      hasCodeChanges,
      changedFileCount,
      addedLines,
      deletedLines,
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

        let summaryText: string;
        if (item.hasCodeChanges) {
          const filePart = chalk.dim(
            `${item.changedFileCount} file${item.changedFileCount !== 1 ? 's' : ''} changed`,
          );
          const diffBadges: string[] = [];
          if (item.addedLines > 0) {
            diffBadges.push(themeColor(theme.diffAddFG)(`+${item.addedLines}`));
          }
          if (item.deletedLines > 0) {
            diffBadges.push(themeColor(theme.diffDeleteFG)(`-${item.deletedLines}`));
          }
          const diffStr = diffBadges.length > 0 ? `  ${diffBadges.join(' ')}` : '';
          summaryText = `  ${filePart}${diffStr}`;
        } else {
          summaryText = `  ${chalk.dim('No code changes')}`;
        }

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
            <Text wrap={false} clip={true} ellipsis={true}>
              {summaryText}
            </Text>
          </Box>
        );
      },
    });
  }
}
