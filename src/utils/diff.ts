export interface DiffLine {
  kind: 'add' | 'delete' | 'neutral' | 'hunk';
  prefix: string;
  lineNumber?: number;
  text: string;
}

/**
 * Computes a standard git-style unified diff with context hunks and `@@` headers.
 *
 * If changes occur at line 100 and line 1200, it folds unchanged lines in between
 * and outputs separate hunks like:
 * @@ -97,7 +97,7 @@
 * ...
 * @@ -1197,7 +1197,7 @@
 */
export function computeLineDiff(oldText: string, newText: string, contextLines = 3): DiffLine[] {
  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  if (oldLines.length === 0 && newLines.length === 0) {
    return [];
  }

  // Compute Longest Common Subsequence (LCS) matrix
  const M = oldLines.length;
  const N = newLines.length;
  const dp: number[][] = Array.from({ length: M + 1 }, () => new Array(N + 1).fill(0));

  for (let i = 0; i < M; i++) {
    for (let j = 0; j < N; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1]![j + 1] = dp[i]![j]! + 1;
      } else {
        dp[i + 1]![j + 1] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
  }

  // Backtrack to extract raw edit script
  interface EditOp {
    kind: 'add' | 'delete' | 'neutral';
    oldLine?: number;
    newLine?: number;
    text: string;
  }

  const rawOps: EditOp[] = [];
  let i = M;
  let j = N;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      rawOps.unshift({
        kind: 'neutral',
        oldLine: i,
        newLine: j,
        text: oldLines[i - 1]!,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      rawOps.unshift({
        kind: 'add',
        newLine: j,
        text: newLines[j - 1]!,
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i]![j - 1]! < dp[i - 1]![j]!)) {
      rawOps.unshift({
        kind: 'delete',
        oldLine: i,
        text: oldLines[i - 1]!,
      });
      i--;
    }
  }

  // Find all indices with modifications ('add' or 'delete')
  const changeIndices: number[] = [];
  for (let idx = 0; idx < rawOps.length; idx++) {
    if (rawOps[idx]!.kind !== 'neutral') {
      changeIndices.push(idx);
    }
  }

  // If no changes, return full file or empty
  if (changeIndices.length === 0) {
    return rawOps.map((op) => ({
      kind: 'neutral',
      prefix: ' ',
      lineNumber: op.newLine ?? op.oldLine,
      text: op.text,
    }));
  }

  // Group modifications into hunks with contextLines padding
  interface HunkRange {
    start: number;
    end: number;
  }

  const hunks: HunkRange[] = [];
  let curHunk: HunkRange = {
    start: Math.max(0, changeIndices[0]! - contextLines),
    end: Math.min(rawOps.length - 1, changeIndices[0]! + contextLines),
  };

  for (let c = 1; c < changeIndices.length; c++) {
    const nextIdx = changeIndices[c]!;
    const nextStart = Math.max(0, nextIdx - contextLines);
    const nextEnd = Math.min(rawOps.length - 1, nextIdx + contextLines);

    if (nextStart <= curHunk.end + 1) {
      // Overlapping or adjacent hunks -> merge
      curHunk.end = Math.max(curHunk.end, nextEnd);
    } else {
      hunks.push(curHunk);
      curHunk = { start: nextStart, end: nextEnd };
    }
  }
  hunks.push(curHunk);

  const result: DiffLine[] = [];

  for (const hunk of hunks) {
    const hunkOps = rawOps.slice(hunk.start, hunk.end + 1);

    // Calculate hunk header line ranges
    let oldStart = 0;
    let oldCount = 0;
    let newStart = 0;
    let newCount = 0;

    for (const op of hunkOps) {
      if (op.kind === 'neutral') {
        if (oldStart === 0) oldStart = op.oldLine ?? 1;
        if (newStart === 0) newStart = op.newLine ?? 1;
        oldCount++;
        newCount++;
      } else if (op.kind === 'delete') {
        if (oldStart === 0) oldStart = op.oldLine ?? 1;
        oldCount++;
      } else if (op.kind === 'add') {
        if (newStart === 0) newStart = op.newLine ?? 1;
        newCount++;
      }
    }

    if (oldStart === 0) oldStart = 1;
    if (newStart === 0) newStart = 1;

    // Standard git @@ -oldStart,oldCount +newStart,newCount @@ header
    result.push({
      kind: 'hunk',
      prefix: '@@',
      text: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    });

    for (const op of hunkOps) {
      if (op.kind === 'neutral') {
        result.push({
          kind: 'neutral',
          prefix: ' ',
          lineNumber: op.newLine ?? op.oldLine,
          text: op.text,
        });
      } else if (op.kind === 'delete') {
        result.push({
          kind: 'delete',
          prefix: '-',
          lineNumber: op.oldLine,
          text: op.text,
        });
      } else if (op.kind === 'add') {
        result.push({
          kind: 'add',
          prefix: '+',
          lineNumber: op.newLine,
          text: op.text,
        });
      }
    }
  }

  return result;
}
