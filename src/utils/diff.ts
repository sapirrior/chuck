export interface DiffLine {
  kind: 'add' | 'delete' | 'neutral';
  prefix: string;
  lineNumber?: number;
  text: string;
}

/**
 * Computes a line-by-line diff between two text strings.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];
  const result: DiffLine[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const oldL = oldLines[i];
    const newL = newLines[i];

    if (oldL === newL && oldL !== undefined) {
      result.push({
        kind: 'neutral',
        prefix: ' ',
        lineNumber: i + 1,
        text: oldL,
      });
    } else {
      if (oldL !== undefined) {
        result.push({
          kind: 'delete',
          prefix: '-',
          lineNumber: i + 1,
          text: oldL,
        });
      }
      if (newL !== undefined) {
        result.push({
          kind: 'add',
          prefix: '+',
          lineNumber: i + 1,
          text: newL,
        });
      }
    }
  }

  return result;
}
