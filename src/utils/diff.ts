export type DiffLineKind = 'context' | 'addition' | 'deletion';

export interface DiffSpan {
  text: string;
  kind: 'equal' | 'addition' | 'deletion';
}

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  ending?: string;
  oldLineNumber?: number;
  newLineNumber?: number;
  spans?: DiffSpan[];
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface UnifiedDiff {
  hunks: DiffHunk[];
  oldLineCount: number;
  newLineCount: number;
}

interface LineToken {
  text: string;
  ending: string;
}

function tokenizeLines(content: string): LineToken[] {
  if (!content) return [];
  const tokens: LineToken[] = [];
  const regex = /([^\r\n]*)(\r?\n)?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index === content.length) break;
    const text = match[1] ?? '';
    const ending = match[2] ?? '';
    tokens.push({ text, ending });
    if (!ending && match.index + text.length === content.length) break;
  }
  return tokens;
}

export function tokenizeWords(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[\w]+|[^\w\s]+|\s+/g);
  return matches ?? [text];
}

interface EditOp<T> {
  kind: 'equal' | 'insert' | 'delete';
  oldItem?: T;
  newItem?: T;
  oldIndex?: number;
  newIndex?: number;
}

/**
 * Compact O(ND) Myers diff algorithm for generic arrays.
 */
function myersDiff<T>(
  oldArr: T[],
  newArr: T[],
  equals: (a: T, b: T) => boolean = (a, b) => a === b,
): EditOp<T>[] {
  const n = oldArr.length;
  const m = newArr.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) return newArr.map((newItem, i) => ({ kind: 'insert', newItem, newIndex: i }));
  if (m === 0) return oldArr.map((oldItem, i) => ({ kind: 'delete', oldItem, oldIndex: i }));

  const max = n + m;
  const v: { [k: number]: number } = { 1: 0 };
  const trace: Array<{ [k: number]: number }> = [];

  for (let d = 0; d <= max; d++) {
    trace.push({ ...v });
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && (v[k - 1] ?? -1) < (v[k + 1] ?? -1))
          ? (v[k + 1] ?? 0)
          : (v[k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && equals(oldArr[x]!, newArr[y]!)) {
        x++;
        y++;
      }
      v[k] = x;
      if (x >= n && y >= m) {
        // Backtrack
        const ops: EditOp<T>[] = [];
        let cx = n;
        let cy = m;
        for (let cd = d; cd > 0; cd--) {
          const prevV = trace[cd]!;
          const pk = cx - cy;
          const prevK =
            pk === -cd || (pk !== cd && (prevV[pk - 1] ?? -1) < (prevV[pk + 1] ?? -1))
              ? pk + 1
              : pk - 1;
          const prevX = prevV[prevK] ?? 0;
          const prevY = prevX - prevK;

          while (
            cx > prevX + (prevK === pk + 1 ? 0 : 1) &&
            cy > prevY + (prevK === pk + 1 ? 1 : 0)
          ) {
            cx--;
            cy--;
            ops.push({
              kind: 'equal',
              oldItem: oldArr[cx],
              newItem: newArr[cy],
              oldIndex: cx,
              newIndex: cy,
            });
          }

          if (prevK === pk + 1) {
            cy--;
            ops.push({ kind: 'insert', newItem: newArr[cy], newIndex: cy });
          } else {
            cx--;
            ops.push({ kind: 'delete', oldItem: oldArr[cx], oldIndex: cx });
          }
        }
        while (cx > 0 && cy > 0) {
          cx--;
          cy--;
          ops.push({
            kind: 'equal',
            oldItem: oldArr[cx],
            newItem: newArr[cy],
            oldIndex: cx,
            newIndex: cy,
          });
        }
        ops.reverse();
        return ops;
      }
    }
  }
  return [];
}

/**
 * Computes word-level (intra-line) diff spans for paired deletion & addition lines.
 */
export function computeWordDiff(
  oldLine: string,
  newLine: string,
): { oldSpans: DiffSpan[]; newSpans: DiffSpan[] } {
  const oldWords = tokenizeWords(oldLine);
  const newWords = tokenizeWords(newLine);
  const ops = myersDiff(oldWords, newWords);

  const oldSpans: DiffSpan[] = [];
  const newSpans: DiffSpan[] = [];

  for (const op of ops) {
    if (op.kind === 'equal') {
      const text = op.oldItem ?? '';
      oldSpans.push({ text, kind: 'equal' });
      newSpans.push({ text, kind: 'equal' });
    } else if (op.kind === 'delete') {
      oldSpans.push({ text: op.oldItem ?? '', kind: 'deletion' });
    } else if (op.kind === 'insert') {
      newSpans.push({ text: op.newItem ?? '', kind: 'addition' });
    }
  }

  return { oldSpans, newSpans };
}

/**
 * Builds a unified diff with line-level Myers diff and intra-line word diffs.
 */
export function buildUnifiedDiff(before: string, after: string, contextLines = 3): UnifiedDiff {
  const oldTokens = tokenizeLines(before);
  const newTokens = tokenizeLines(after);

  if (before === after) {
    return { hunks: [], oldLineCount: oldTokens.length, newLineCount: newTokens.length };
  }

  const ops = myersDiff(oldTokens, newTokens, (a, b) => a.text === b.text && a.ending === b.ending);
  const editIndices = ops.map((op, i) => (op.kind !== 'equal' ? i : -1)).filter((i) => i !== -1);

  if (editIndices.length === 0) {
    return { hunks: [], oldLineCount: oldTokens.length, newLineCount: newTokens.length };
  }

  // Group into hunks with context merging
  const hunkRanges: Array<{ startIdx: number; endIdx: number }> = [];
  let currentRange = {
    startIdx: Math.max(0, editIndices[0]! - contextLines),
    endIdx: Math.min(ops.length - 1, editIndices[0]! + contextLines),
  };

  for (let i = 1; i < editIndices.length; i++) {
    const editIdx = editIndices[i]!;
    const opStart = Math.max(0, editIdx - contextLines);
    const opEnd = Math.min(ops.length - 1, editIdx + contextLines);

    if (opStart <= currentRange.endIdx) {
      currentRange.endIdx = Math.max(currentRange.endIdx, opEnd);
    } else {
      hunkRanges.push(currentRange);
      currentRange = { startIdx: opStart, endIdx: opEnd };
    }
  }
  hunkRanges.push(currentRange);

  const hunks: DiffHunk[] = [];

  for (const range of hunkRanges) {
    const lines: DiffLine[] = [];
    let oldCount = 0;
    let newCount = 0;
    let oldStart: number | null = null;
    let newStart: number | null = null;

    for (let i = range.startIdx; i <= range.endIdx; i++) {
      const op = ops[i]!;
      if (op.kind === 'equal') {
        const oIdx = op.oldIndex! + 1;
        const nIdx = op.newIndex! + 1;
        if (oldStart === null) oldStart = oIdx;
        if (newStart === null) newStart = nIdx;
        lines.push({
          kind: 'context',
          text: op.oldItem!.text,
          ending: op.oldItem!.ending,
          oldLineNumber: oIdx,
          newLineNumber: nIdx,
        });
        oldCount++;
        newCount++;
      } else if (op.kind === 'delete') {
        const oIdx = op.oldIndex! + 1;
        if (oldStart === null) oldStart = oIdx;
        lines.push({
          kind: 'deletion',
          text: op.oldItem!.text,
          ending: op.oldItem!.ending,
          oldLineNumber: oIdx,
        });
        oldCount++;
      } else if (op.kind === 'insert') {
        const nIdx = op.newIndex! + 1;
        if (newStart === null) newStart = nIdx;
        lines.push({
          kind: 'addition',
          text: op.newItem!.text,
          ending: op.newItem!.ending,
          newLineNumber: nIdx,
        });
        newCount++;
      }
    }

    // Attach intra-line word diffs to adjacent deletion + addition pairs
    let l = 0;
    while (l < lines.length) {
      if (lines[l]?.kind === 'deletion') {
        const delStart = l;
        while (l < lines.length && lines[l]?.kind === 'deletion') l++;
        const delEnd = l;
        const addStart = l;
        while (l < lines.length && lines[l]?.kind === 'addition') l++;
        const addEnd = l;

        const delCount = delEnd - delStart;
        const addCount = addEnd - addStart;
        const pairCount = Math.min(delCount, addCount);

        for (let p = 0; p < pairCount; p++) {
          const delLine = lines[delStart + p]!;
          const addLine = lines[addStart + p]!;
          const { oldSpans, newSpans } = computeWordDiff(delLine.text, addLine.text);
          delLine.spans = oldSpans;
          addLine.spans = newSpans;
        }
      } else {
        l++;
      }
    }

    hunks.push({
      oldStart: oldStart ?? (oldTokens.length === 0 ? 0 : 1),
      oldCount,
      newStart: newStart ?? (newTokens.length === 0 ? 0 : 1),
      newCount,
      lines,
    });
  }

  return {
    hunks,
    oldLineCount: oldTokens.length,
    newLineCount: newTokens.length,
  };
}

/**
 * Applies a UnifiedDiff to the base content.
 */
export function applyUnifiedDiff(before: string, diff: UnifiedDiff): string {
  if (diff.hunks.length === 0) return before;

  const oldTokens = tokenizeLines(before);
  const resultTokens: LineToken[] = [];
  let oldTokenIdx = 0;

  for (const hunk of diff.hunks) {
    const targetOldStartIdx = hunk.oldStart > 0 ? hunk.oldStart - 1 : 0;
    while (oldTokenIdx < targetOldStartIdx && oldTokenIdx < oldTokens.length) {
      resultTokens.push(oldTokens[oldTokenIdx]!);
      oldTokenIdx++;
    }

    for (const line of hunk.lines) {
      if (line.kind === 'context') {
        if (oldTokenIdx >= oldTokens.length || oldTokens[oldTokenIdx]!.text !== line.text) {
          throw new Error(`Diff apply error: context mismatch at line ${oldTokenIdx + 1}.`);
        }
        resultTokens.push({
          text: line.text,
          ending: line.ending ?? oldTokens[oldTokenIdx]!.ending,
        });
        oldTokenIdx++;
      } else if (line.kind === 'deletion') {
        if (oldTokenIdx >= oldTokens.length || oldTokens[oldTokenIdx]!.text !== line.text) {
          throw new Error(`Diff apply error: deletion mismatch at line ${oldTokenIdx + 1}.`);
        }
        oldTokenIdx++;
      } else if (line.kind === 'addition') {
        resultTokens.push({
          text: line.text,
          ending: line.ending ?? (oldTokens[0]?.ending || '\n'),
        });
      }
    }
  }

  while (oldTokenIdx < oldTokens.length) {
    resultTokens.push(oldTokens[oldTokenIdx]!);
    oldTokenIdx++;
  }

  return resultTokens.map((t) => t.text + t.ending).join('');
}
