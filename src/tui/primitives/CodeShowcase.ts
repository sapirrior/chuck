import { getTheme } from '../../theme/index.js';
import { themeColor, themeBgColor, chalk } from '../utils/format.js';
import { wrapVisualLine } from '../engine/cell-layout.js';
import type { DiffLine } from '../../utils/diff.js';

export interface CodeShowcaseOptions {
  /** All available lines of content */
  lines?: string[];
  /** Structured diff lines with add/delete/neutral formatting */
  diffLines?: DiffLine[];
  /** Starting line number in the original file/stream (1-indexed, default: 1) */
  startLineNumber?: number;
  /** Total number of lines in original file/stream if known */
  totalLines?: number;
  /** Max lines to render in preview window (default: 10) */
  maxLines?: number;
  /** Window alignment strategy: 'start' (write_file), 'end' (run_command), or 'highlight' (edit_file) */
  mode?: 'start' | 'end' | 'highlight';
  /** Target 0-indexed line in `lines` to center window around when mode is 'highlight' */
  highlightLineIndex?: number;
  /** Number of modified lines starting from highlightLineIndex */
  highlightCount?: number;
  /** Header message under tool title (e.g. "Wrote 17 lines to story.txt" or "Updated foo.ts") */
  headerMessage?: string;
  /** Max column width for line wrapping (defaults to terminal width) */
  maxWidth?: number;
}

/**
 * CodeShowcase Primitive:
 * Standardized preview window for tool results (edit_file, write_file, run_command).
 * - write_file / create: clean white text with dim line numbers and wrapped continuation lines
 * - edit_file: exact confirmation dock diff colors (red bg for -, green bg for +, white for context)
 * - run_command: 10 newest lines of stream output
 */
export class CodeShowcase {
  public static render(options: CodeShowcaseOptions): string[] {
    const {
      lines = [],
      diffLines,
      startLineNumber = 1,
      totalLines = lines.length,
      maxLines = 10,
      mode = 'start',
      highlightLineIndex = 0,
      highlightCount = 1,
      headerMessage,
      maxWidth,
    } = options;

    const theme = getTheme();
    const rendered: string[] = [];
    const termWidth = maxWidth ?? process.stdout.columns ?? 100;

    // Optional header message (e.g. └ Wrote 17 lines to story.txt / └ Updated story.txt)
    if (headerMessage) {
      rendered.push(`  ${chalk.dim('└ ')}${chalk.dim(headerMessage)}`);
    }

    // 1. Structured Diff Rendering (for edit_file) with exact confirmation box bg & fg
    if (diffLines && diffLines.length > 0) {
      // Filter out 'hunk' headers so every row in the preview is an actual code line
      const codeDiffLines = diffLines.filter((dl) => dl.kind !== 'hunk');
      const firstChangeIdx = codeDiffLines.findIndex(
        (dl) => dl.kind === 'add' || dl.kind === 'delete',
      );
      const changeIdx = firstChangeIdx >= 0 ? firstChangeIdx : 0;

      // Center the preview window on the modification and guarantee up to maxLines (10 lines)
      const halfWindow = Math.floor(maxLines / 2);
      let startIdx = Math.max(0, changeIdx - halfWindow);
      let endIdx = Math.min(codeDiffLines.length, startIdx + maxLines);

      // If near end, shift startIdx back to fill all 10 lines
      if (endIdx - startIdx < maxLines && startIdx > 0) {
        startIdx = Math.max(0, endIdx - maxLines);
      }
      // If near start, shift endIdx forward to fill all 10 lines
      if (endIdx - startIdx < maxLines && endIdx < codeDiffLines.length) {
        endIdx = Math.min(codeDiffLines.length, startIdx + maxLines);
      }

      const windowDiff = codeDiffLines.slice(startIdx, endIdx);

      const maxLineNum = Math.max(...windowDiff.map((d) => d.lineNumber ?? 0).filter(Boolean), 10);
      const padWidth = Math.max(3, String(maxLineNum).length);
      const textAvailableWidth = Math.max(20, termWidth - (padWidth + 8));

      const addBg = themeBgColor(theme.diffAddBG);
      const addFg = themeColor(theme.diffAddFG);
      const delBg = themeBgColor(theme.diffDeleteBG);
      const delFg = themeColor(theme.diffDeleteFG);

      for (const dl of windowDiff) {
        const lineNumStr = dl.lineNumber
          ? String(dl.lineNumber).padStart(padWidth, ' ')
          : ' '.repeat(padWidth);
        const rawText = dl.text ?? '';
        const wrapped = rawText ? wrapVisualLine(rawText, textAvailableWidth) : [''];

        for (let k = 0; k < wrapped.length; k++) {
          const seg = wrapped[k] ?? '';
          const numPrefix = k === 0 ? lineNumStr : ' '.repeat(padWidth);

          if (dl.kind === 'delete') {
            const lineStr = `${numPrefix} -${seg}`;
            rendered.push(`    ${delBg(delFg(lineStr))}`);
          } else if (dl.kind === 'add') {
            const lineStr = `${numPrefix} +${seg}`;
            rendered.push(`    ${addBg(addFg(lineStr))}`);
          } else {
            rendered.push(`    ${chalk.dim(`${numPrefix}  `)}${chalk.white(seg)}`);
          }
        }
      }

      return rendered;
    }

    // 2. Standard Plain Lines Rendering (for write_file & run_command) - Crisp White Text
    if (lines.length === 0) {
      return rendered;
    }

    let startIdx = 0;
    let endIdx = lines.length;

    if (mode === 'start') {
      startIdx = 0;
      endIdx = Math.min(lines.length, maxLines);
    } else if (mode === 'end') {
      startIdx = Math.max(0, lines.length - maxLines);
      endIdx = lines.length;
    } else if (mode === 'highlight') {
      const halfWindow = Math.floor(maxLines / 2);
      startIdx = Math.max(
        0,
        highlightLineIndex - Math.max(2, halfWindow - Math.floor(highlightCount / 2)),
      );
      endIdx = Math.min(lines.length, startIdx + maxLines);
      if (endIdx - startIdx < maxLines) {
        startIdx = Math.max(0, endIdx - maxLines);
      }
    }

    const windowLines = lines.slice(startIdx, endIdx);
    const hiddenBottom = Math.max(0, totalLines - (startLineNumber - 1 + endIdx));

    const highestLineNumber = startLineNumber + endIdx;
    const padWidth = Math.max(3, String(highestLineNumber).length);
    const textAvailableWidth = Math.max(20, termWidth - (padWidth + 8));

    for (let i = 0; i < windowLines.length; i++) {
      const lineIdx = startIdx + i;
      const actualLineNumber = startLineNumber + lineIdx;
      const rawText = windowLines[i] ?? '';
      const wrapped = rawText ? wrapVisualLine(rawText, textAvailableWidth) : [''];

      for (let k = 0; k < wrapped.length; k++) {
        const seg = wrapped[k] ?? '';
        const numStr =
          k === 0 ? String(actualLineNumber).padStart(padWidth, ' ') : ' '.repeat(padWidth);
        rendered.push(`    ${chalk.dim(numStr)}  ${chalk.white(seg)}`);
      }
    }

    // Bottom expansion indicator only for write_file / streaming when extra lines exist
    if (hiddenBottom > 0) {
      rendered.push(`  ${chalk.dim(`... +${hiddenBottom} lines (ctrl+o to expand)`)}`);
    }

    return rendered;
  }
}
