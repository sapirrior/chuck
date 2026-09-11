import { DocumentTree } from './DocumentTree.js';
import { layoutDocument, type CellLayoutResult } from './cell-layout.js';

export interface DocumentFrame {
  lines: string[];
  cursor: { line: number; column: number } | null;
  totalVisualRows: number;
  maxScrollOffset: number;
  currentScrollOffset: number;
}

export function computeDocumentFrame(
  tree: DocumentTree,
  termWidth: number,
  termHeight: number,
  scrollOffset = 0,
  forceAll = false,
  lineWidthCache: Map<string, number> = new Map(),
): DocumentFrame {
  const safeWidth = Math.max(20, termWidth - 1);
  const layout: CellLayoutResult = layoutDocument(tree, safeWidth, forceAll, lineWidthCache);
  const physicalRows = layout.physicalRows;
  const totalPhysicalRows = layout.totalPhysicalRows;

  const maxRows = Math.max(1, termHeight);
  const maxScrollOffset = Math.max(0, totalPhysicalRows - maxRows);
  const clampedScroll = Math.max(0, Math.min(scrollOffset, maxScrollOffset));

  // Determine viewport physical row window based on scroll offset from the bottom
  const endIndex = Math.max(0, totalPhysicalRows - clampedScroll);
  const startIndex = Math.max(0, endIndex - maxRows);

  const viewportRows = physicalRows.slice(startIndex, endIndex);
  const viewportLines = viewportRows.map((r) => r.text);

  // Translate physical cursor into viewport-relative screen row
  let adjustedCursor: { line: number; column: number } | null = null;
  if (layout.cursor) {
    const cursorViewportRow = layout.cursor.row - startIndex;
    if (
      cursorViewportRow >= 0 &&
      cursorViewportRow < viewportLines.length &&
      cursorViewportRow < maxRows
    ) {
      adjustedCursor = {
        line: cursorViewportRow,
        column: layout.cursor.column,
      };
    }
  }

  return {
    lines: viewportLines,
    cursor: adjustedCursor,
    totalVisualRows: totalPhysicalRows,
    maxScrollOffset,
    currentScrollOffset: clampedScroll,
  };
}
