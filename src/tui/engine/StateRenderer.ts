import type { DocumentTree } from './DocumentTree.js';
import { computeDocumentFrame, type DocumentFrame } from './FrameBuffer.js';
import { ScreenBuffer } from '../layout/ScreenBuffer.js';

export default class StateRenderer {
  private syncActive = false;
  /** Last painted ScreenBuffer — used for diffing on the next frame. */
  private previousBuffer: ScreenBuffer | null = null;

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
    const currentBuffer = new ScreenBuffer(termWidth, termHeight);
    for (let y = 0; y < nextLines.length && y < termHeight; y++) {
      const line = nextLines[y] ?? '';
      currentBuffer.blitText(0, y, termWidth, line);
    }

    let output = this.beginSync();

    if (forceFull || !this.previousBuffer) {
      // Full repaint: clear screen then write all lines top-to-bottom
      output += '\x1b[H\x1b[J';
      for (let i = 0; i < termHeight; i++) {
        const line = currentBuffer.getRow(i);
        const resetSuffix = line.includes('\x1b') && !line.endsWith('\x1b[0m') ? '\x1b[0m' : '';
        output +=
          i === termHeight - 1 ? '\r' + line + resetSuffix : '\r' + line + resetSuffix + '\n';
      }
    } else {
      // ScreenBuffer-based diff: only rewrite rows that changed
      const diffs = currentBuffer.diff(this.previousBuffer);
      for (const { row, text } of diffs) {
        if (text.length > 0) {
          const resetSuffix = text.includes('\x1b') && !text.endsWith('\x1b[0m') ? '\x1b[0m' : '';
          output += `\x1b[${row + 1};1H\x1b[2K${text}${resetSuffix}`;
        } else {
          output += `\x1b[${row + 1};1H\x1b[2K\x1b[0m`;
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

    this.previousBuffer = currentBuffer;
    return nextFrame;
  }

  /**
   * Resets the previous-frame baseline so the next render does a full repaint.
   * Called when the alternate screen is re-entered or history is flushed.
   */
  clearPreviousFrameRecord(): void {
    this.previousBuffer = null;
  }
}
