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

export interface PrefixedBlockOptions {
  continuationPrefix?: string;
  continuationIndent?: number;
  width?: number;
  bg?: (str: string) => string;
  padToWidth?: boolean;
}

/**
 * Renders a block with `firstPrefix` on the initial row and `continuationPrefix` (or indent) on wrapped continuation rows.
 */
export function prefixedBlock(
  firstPrefix: string,
  body: string,
  opts?: PrefixedBlockOptions,
): string[] {
  const maxCols = opts?.width ?? process.stdout.columns ?? 80;
  const cont =
    opts?.continuationPrefix ??
    (opts?.continuationIndent !== undefined
      ? ' '.repeat(opts.continuationIndent)
      : ' '.repeat(stringWidth(stripAnsi(firstPrefix))));
  const fullText = `${firstPrefix}${body}`;
  const lines = wrapVisualLine(fullText, maxCols, cont);

  if (!opts?.bg) {
    return lines;
  }

  const bgFn = opts.bg;
  if (opts.padToWidth) {
    return lines.map((line) => {
      const visLen = stringWidth(stripAnsi(line));
      const padLen = Math.max(0, maxCols - visLen);
      return bgFn(`${line}${' '.repeat(padLen)}`);
    });
  }

  return lines.map((line) => bgFn(line));
}
