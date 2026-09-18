export type DiffLineKind = 'context' | 'addition' | 'deletion';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  ending?: string;
  oldLineNumber?: number;
  newLineNumber?: number;
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
  if (content.length === 0) {
    return [];
  }

  const tokens: LineToken[] = [];
  const regex = /([^\r\n]*)(\r?\n)?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index === content.length) {
      break;
    }
    const text = match[1] ?? '';
    const ending = match[2] ?? '';
    tokens.push({ text, ending });
    if (!ending && match.index + text.length === content.length) {
      break;
    }
  }

  return tokens;
}

function tokensEqual(a: LineToken, b: LineToken): boolean {
  return a.text === b.text && a.ending === b.ending;
}

interface EditOp {
  kind: 'equal' | 'insert' | 'delete';
  token: LineToken;
  oldLine?: number;
  newLine?: number;
}

function myersDiff(oldTokens: LineToken[], newTokens: LineToken[]): EditOp[] {
  const n = oldTokens.length;
  const m = newTokens.length;

  if (n === 0 && m === 0) {
    return [];
  }

  if (n === 0) {
    return newTokens.map((token, i) => ({
      kind: 'insert',
      token,
      newLine: i + 1,
    }));
  }

  if (m === 0) {
    return oldTokens.map((token, i) => ({
      kind: 'delete',
      token,
      oldLine: i + 1,
    }));
  }

  const max = n + m;
  const v: { [k: number]: number } = { 1: 0 };
  const trace: Array<{ [k: number]: number }> = [];

  for (let d = 0; d <= max; d++) {
    const vCopy = { ...v };
    trace.push(vCopy);

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v[k - 1] ?? -1) < (v[k + 1] ?? -1))) {
        x = v[k + 1] ?? 0;
      } else {
        x = (v[k - 1] ?? 0) + 1;
      }

      let y = x - k;

      while (x < n && y < m && tokensEqual(oldTokens[x], newTokens[y])) {
        x++;
        y++;
      }

      v[k] = x;

      if (x >= n && y >= m) {
        return backtrack(trace, oldTokens, newTokens, d);
      }
    }
  }

  return [];
}

function backtrack(
  trace: Array<{ [k: number]: number }>,
  oldTokens: LineToken[],
  newTokens: LineToken[],
  d: number,
): EditOp[] {
  const ops: EditOp[] = [];
  let x = oldTokens.length;
  let y = newTokens.length;

  for (let currentD = d; currentD > 0; currentD--) {
    const v = trace[currentD];
    const k = x - y;

    const prevK =
      k === -currentD || (k !== currentD && (v[k - 1] ?? -1) < (v[k + 1] ?? -1)) ? k + 1 : k - 1;

    const prevX = v[prevK] ?? 0;
    const prevY = prevX - prevK;

    // Snake (equals) at end of step
    while (x > prevX + (prevK === k + 1 ? 0 : 1) && y > prevY + (prevK === k + 1 ? 1 : 0)) {
      x--;
      y--;
      ops.push({
        kind: 'equal',
        token: oldTokens[x],
        oldLine: x + 1,
        newLine: y + 1,
      });
    }

    if (prevK === k + 1) {
      // Down move (insertion)
      y--;
      ops.push({
        kind: 'insert',
        token: newTokens[y],
        newLine: y + 1,
      });
    } else {
      // Right move (deletion)
      x--;
      ops.push({
        kind: 'delete',
        token: oldTokens[x],
        oldLine: x + 1,
      });
    }
  }

  // Initial snake
  while (x > 0 && y > 0) {
    x--;
    y--;
    ops.push({
      kind: 'equal',
      token: oldTokens[x],
      oldLine: x + 1,
      newLine: y + 1,
    });
  }

  ops.reverse();
  return ops;
}

export function buildUnifiedDiff(before: string, after: string, contextLines = 3): UnifiedDiff {
  const oldTokens = tokenizeLines(before);
  const newTokens = tokenizeLines(after);

  if (before === after) {
    return {
      hunks: [],
      oldLineCount: oldTokens.length,
      newLineCount: newTokens.length,
    };
  }

  const ops = myersDiff(oldTokens, newTokens);

  // Find all non-equal edit indices
  const editIndices: number[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].kind !== 'equal') {
      editIndices.push(i);
    }
  }

  if (editIndices.length === 0) {
    return {
      hunks: [],
      oldLineCount: oldTokens.length,
      newLineCount: newTokens.length,
    };
  }

  // Group edit indices into hunks based on contextLines
  interface HunkRange {
    startIdx: number;
    endIdx: number;
  }

  const hunkRanges: HunkRange[] = [];
  let currentRange: HunkRange = {
    startIdx: Math.max(0, editIndices[0] - contextLines),
    endIdx: Math.min(ops.length - 1, editIndices[0] + contextLines),
  };

  for (let i = 1; i < editIndices.length; i++) {
    const editIdx = editIndices[i];
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
      const op = ops[i];
      if (op.kind === 'equal') {
        if (oldStart === null && op.oldLine !== undefined) oldStart = op.oldLine;
        if (newStart === null && op.newLine !== undefined) newStart = op.newLine;
        lines.push({
          kind: 'context',
          text: op.token.text,
          ending: op.token.ending,
          oldLineNumber: op.oldLine,
          newLineNumber: op.newLine,
        });
        oldCount++;
        newCount++;
      } else if (op.kind === 'delete') {
        if (oldStart === null && op.oldLine !== undefined) oldStart = op.oldLine;
        lines.push({
          kind: 'deletion',
          text: op.token.text,
          ending: op.token.ending,
          oldLineNumber: op.oldLine,
        });
        oldCount++;
      } else if (op.kind === 'insert') {
        if (newStart === null && op.newLine !== undefined) newStart = op.newLine;
        lines.push({
          kind: 'addition',
          text: op.token.text,
          ending: op.token.ending,
          newLineNumber: op.newLine,
        });
        newCount++;
      }
    }

    // Default line start fallbacks if file was empty
    const resolvedOldStart = oldStart ?? (oldTokens.length === 0 ? 0 : 1);
    const resolvedNewStart = newStart ?? (newTokens.length === 0 ? 0 : 1);

    hunks.push({
      oldStart: resolvedOldStart,
      oldCount,
      newStart: resolvedNewStart,
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

export function applyUnifiedDiff(before: string, diff: UnifiedDiff): string {
  if (diff.hunks.length === 0) {
    return before;
  }

  const oldTokens = tokenizeLines(before);
  const resultTokens: LineToken[] = [];
  let oldTokenIdx = 0; // 0-indexed

  for (const hunk of diff.hunks) {
    const targetOldStartIdx = hunk.oldStart > 0 ? hunk.oldStart - 1 : 0;

    // Copy unchanged tokens preceding this hunk
    while (oldTokenIdx < targetOldStartIdx && oldTokenIdx < oldTokens.length) {
      resultTokens.push(oldTokens[oldTokenIdx]);
      oldTokenIdx++;
    }

    for (const line of hunk.lines) {
      if (line.kind === 'context') {
        if (oldTokenIdx >= oldTokens.length) {
          throw new Error(
            `Diff apply error: expected context line "${line.text}" past end of file.`,
          );
        }
        const current = oldTokens[oldTokenIdx];
        if (current.text !== line.text) {
          throw new Error(
            `Diff apply error: context mismatch at line ${oldTokenIdx + 1}. Expected "${line.text}", found "${current.text}".`,
          );
        }
        resultTokens.push({
          text: line.text,
          ending: line.ending ?? current.ending,
        });
        oldTokenIdx++;
      } else if (line.kind === 'deletion') {
        if (oldTokenIdx >= oldTokens.length) {
          throw new Error(
            `Diff apply error: expected deletion line "${line.text}" past end of file.`,
          );
        }
        const current = oldTokens[oldTokenIdx];
        if (current.text !== line.text) {
          throw new Error(
            `Diff apply error: deletion mismatch at line ${oldTokenIdx + 1}. Expected "${line.text}", found "${current.text}".`,
          );
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

  // Copy any remaining tokens after the last hunk
  while (oldTokenIdx < oldTokens.length) {
    resultTokens.push(oldTokens[oldTokenIdx]);
    oldTokenIdx++;
  }

  return resultTokens.map((t) => t.text + t.ending).join('');
}

