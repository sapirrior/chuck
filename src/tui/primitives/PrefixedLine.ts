import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import { wrapVisualLine } from '../engine/cell-layout.js';

export interface PrefixedLineOptions {
  continuationIndent?: number;
  width?: number;
}

/**
 * Renders a line with an explicit prefix on the first line, and pads continuation lines
 * by `continuationIndent ?? stringWidth(stripAnsi(prefix))` columns.
 */
export function prefixedLine(prefix: string, body: string, opts?: PrefixedLineOptions): string[] {
  const maxCols = opts?.width ?? process.stdout.columns ?? 80;
  const continuationIndent = opts?.continuationIndent ?? stringWidth(stripAnsi(prefix));
  const fullText = `${prefix}${body}`;
  return wrapVisualLine(fullText, maxCols, continuationIndent);
}
