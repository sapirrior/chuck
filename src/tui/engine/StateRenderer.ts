import type { DocumentTree } from './DocumentTree.js';
import { computeDocumentFrame, type DocumentFrame } from './FrameBuffer.js';

export default class StateRenderer {
  private syncActive = false;
  /** Last painted lines — used for diffing on the next frame. */
  private previousLines: string[] = [];

  private beginSync(): string {
    if (this.syncActive) return '';
    this.syncActive = true;
    return '\x1b[?2026h';
  }

  private endSync(): string {
    if (!this.syncActive) return '';
    this.syncActive = false;
    return '\x1b[?2026l';
  }

  render(
    tree: DocumentTree,
    scrollOffset = 0,
    forceFull = false,
    lineWidthCache: Map<string, number> = new Map(),
  ): DocumentFrame {
    const termWidth = process.stdout.columns || 80;
    const termHeight = process.stdout.rows || 24;

    const nextFrame = computeDocumentFrame(
      tree,
      termWidth,
      termHeight,
      scrollOffset,
      forceFull,
      lineWidthCache,
    );

    const nextLines = nextFrame.lines;
    let output = this.beginSync();

    if (forceFull || this.previousLines.length === 0) {
      // Full repaint: clear screen then write all lines top-to-bottom
      output += '\x1b[H\x1b[J';
      for (let i = 0; i < nextLines.length; i++) {
        const line = nextLines[i] ?? '';
        const resetSuffix = line.includes('\x1b') && !line.endsWith('\x1b[0m') ? '\x1b[0m' : '';
        output +=
          i === nextLines.length - 1 ? '\r' + line + resetSuffix : '\r' + line + resetSuffix + '\n';
      }
    } else {
      // Line-diff: only rewrite lines that changed
      const maxLen = Math.max(nextLines.length, this.previousLines.length);
      for (let i = 0; i < maxLen; i++) {
        const next = nextLines[i];
        const prev = this.previousLines[i];

        if (next !== prev) {
          if (next !== undefined && next.length > 0) {
            // Move to row i+1 col 1, clear entire row first, then write line with reset
            const resetSuffix = next.includes('\x1b') && !next.endsWith('\x1b[0m') ? '\x1b[0m' : '';
            output += `\x1b[${i + 1};1H\x1b[2K${next}${resetSuffix}`;
          } else {
            // Clear entire row if line was removed or empty
            output += `\x1b[${i + 1};1H\x1b[2K\x1b[0m`;
          }
        }
      }
    }

    // Place cursor
    if (nextFrame.cursor) {
      output += `\x1b[?25h\x1b[${nextFrame.cursor.line + 1};${nextFrame.cursor.column}H`;
    } else {
      output += '\x1b[?25l';
    }

    output += this.endSync();

    if (output.length > 0) {
      process.stdout.write(output);
    }

    this.previousLines = nextLines.slice();
    return nextFrame;
  }

  /**
   * Resets the previous-frame baseline so the next render does a full repaint.
   * Called when the alternate screen is re-entered or history is flushed.
   */
  clearPreviousFrameRecord(): void {
    this.previousLines = [];
  }
}
