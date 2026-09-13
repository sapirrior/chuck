export interface DiffLine {
  kind: 'add' | 'delete' | 'neutral' | 'hunk';
  prefix: string;
  lineNumber?: number;
  text: string;
}

export const DIFF_FULL_ALGORITHM_LINE_CAP = 2000;

interface EditOp {
  kind: 'add' | 'delete' | 'neutral';
  oldLine?: number;
  newLine?: number;
  text: string;
}

interface HunkRange {
  start: number;
  end: number;
}

/**
 * Builds standard git-style DiffLine[] hunks from an array of EditOp operations.
 */
function buildHunksFromOps(rawOps: EditOp[], contextLines = 3): DiffLine[] {
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

/**
 * Standard dynamic programming LCS diff algorithm for small-to-medium files.
 */
export function computeLcsDiff(
  oldLines: string[],
  newLines: string[],
  contextLines = 3,
  oldLineOffset = 0,
  newLineOffset = 0,
): DiffLine[] {
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

  const rawOps: EditOp[] = [];
  let i = M;
  let j = N;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      rawOps.unshift({
        kind: 'neutral',
        oldLine: i + oldLineOffset,
        newLine: j + newLineOffset,
        text: oldLines[i - 1]!,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      rawOps.unshift({
        kind: 'add',
        newLine: j + newLineOffset,
        text: newLines[j - 1]!,
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i]![j - 1]! < dp[i - 1]![j]!)) {
      rawOps.unshift({
        kind: 'delete',
        oldLine: i + oldLineOffset,
        text: oldLines[i - 1]!,
      });
      i--;
    }
  }

  return buildHunksFromOps(rawOps, contextLines);
}

/**
 * Bounded diff strategy for large inputs: trims common prefix/suffix in O(min(M,N)),
 * then runs LCS or bounded window on the middle region.
 */
export function computeBoundedDiff(
  oldLines: string[],
  newLines: string[],
  contextLines = 3,
): DiffLine[] {
  const M = oldLines.length;
  const N = newLines.length;

  let prefixLen = 0;
  while (prefixLen < M && prefixLen < N && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < M - prefixLen &&
    suffixLen < N - prefixLen &&
    oldLines[M - 1 - suffixLen] === newLines[N - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const oldMid = oldLines.slice(prefixLen, M - suffixLen);
  const newMid = newLines.slice(prefixLen, N - suffixLen);

  // If after trimming prefix & suffix the middle region is within full cap, run exact LCS
  if (oldMid.length + newMid.length <= DIFF_FULL_ALGORITHM_LINE_CAP) {
    const rawOps: EditOp[] = [];

    // Add prefix context lines
    const prefixContextStart = Math.max(0, prefixLen - contextLines);
    for (let p = prefixContextStart; p < prefixLen; p++) {
      rawOps.push({
        kind: 'neutral',
        oldLine: p + 1,
        newLine: p + 1,
        text: oldLines[p]!,
      });
    }

    // Run LCS on middle region
    const midDiff = computeLcsDiff(oldMid, newMid, contextLines, prefixLen, prefixLen);
    // Extract non-hunk diff lines or convert to raw ops
    for (const dl of midDiff) {
      if (dl.kind !== 'hunk') {
        rawOps.push({
          kind: dl.kind,
          oldLine: dl.kind === 'delete' || dl.kind === 'neutral' ? dl.lineNumber : undefined,
          newLine: dl.kind === 'add' || dl.kind === 'neutral' ? dl.lineNumber : undefined,
          text: dl.text,
        });
      }
    }

    // Add suffix context lines
    const suffixContextEnd = Math.min(suffixLen, contextLines);
    for (let s = 0; s < suffixContextEnd; s++) {
      rawOps.push({
        kind: 'neutral',
        oldLine: M - suffixLen + s + 1,
        newLine: N - suffixLen + s + 1,
        text: oldLines[M - suffixLen + s]!,
      });
    }

    return buildHunksFromOps(rawOps, contextLines);
  }

  // Large middle region: produce O(N) bounded summary
  const result: DiffLine[] = [];
  const oldStart = prefixLen + 1;
  const newStart = prefixLen + 1;

  result.push({
    kind: 'hunk',
    prefix: '@@',
    text: `@@ -${oldStart},${oldMid.length} +${newStart},${newMid.length} @@`,
  });

  const previewCap = 30;
  for (let k = 0; k < Math.min(oldMid.length, previewCap); k++) {
    result.push({
      kind: 'delete',
      prefix: '-',
      lineNumber: oldStart + k,
      text: oldMid[k]!,
    });
  }
  if (oldMid.length > previewCap) {
    result.push({
      kind: 'delete',
      prefix: '-',
      text: `... +${oldMid.length - previewCap} more deleted lines`,
    });
  }

  for (let k = 0; k < Math.min(newMid.length, previewCap); k++) {
    result.push({
      kind: 'add',
      prefix: '+',
      lineNumber: newStart + k,
      text: newMid[k]!,
    });
  }
  if (newMid.length > previewCap) {
    result.push({
      kind: 'add',
      prefix: '+',
      text: `... +${newMid.length - previewCap} more added lines`,
    });
  }

  return result;
}

/**
 * Computes a standard git-style unified diff with context hunks and `@@` headers.
 * Automatically falls back to bounded O(N) diffing when inputs exceed DIFF_FULL_ALGORITHM_LINE_CAP.
 */
export function computeLineDiff(oldText: string, newText: string, contextLines = 3): DiffLine[] {
  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  if (oldLines.length === 0 && newLines.length === 0) {
    return [];
  }

  if (oldLines.length + newLines.length > DIFF_FULL_ALGORITHM_LINE_CAP) {
    return computeBoundedDiff(oldLines, newLines, contextLines);
  }

  return computeLcsDiff(oldLines, newLines, contextLines);
}
