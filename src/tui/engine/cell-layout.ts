import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import type { ComponentNode, DocumentTree } from './DocumentTree.js';

export const MAX_READABLE_WIDTH = 100;

export interface PhysicalRow {
  /** The literal string to draw for this row (may contain ANSI SGR codes). */
  text: string;
  /** Index of the logical line (within the whole document) this row was wrapped from. */
  sourceLineIndex: number;
  /** Which wrapped segment of that logical line this is (0 = first segment). */
  wrapSegmentIndex: number;
}

export interface CellCursor {
  /** Absolute physical row (0-indexed, within the full unscrolled document). */
  row: number;
  /** 1-indexed physical column, matching existing ANSI CUP convention used by StateRenderer. */
  column: number;
}

export interface CellLayoutResult {
  /** Every physical row of the full (unscrolled) document, in order. */
  physicalRows: PhysicalRow[];
  /** Absolute physical cursor position, or null if no node reports one. */
  cursor: CellCursor | null;
  /** physicalRows.length, kept explicit for viewport math parity with existing totalVisualRows. */
  totalPhysicalRows: number;
}

interface AnsiToken {
  type: 'ansi' | 'char';
  value: string;
  width: number;
}

interface LayoutChunk {
  isSpace: boolean;
  tokens: AnsiToken[];
  width: number;
}

/**
 * Tokenizes a string into ANSI escape sequences and individual Unicode codepoints/characters.
 */
function tokenizeAnsi(text: string): AnsiToken[] {
  const tokens: AnsiToken[] = [];
  const ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ansiRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plainSegment = text.slice(lastIndex, match.index);
      for (const char of plainSegment) {
        tokens.push({
          type: 'char',
          value: char,
          width: stringWidth(char),
        });
      }
    }
    tokens.push({
      type: 'ansi',
      value: match[0],
      width: 0,
    });
    lastIndex = ansiRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    const plainSegment = text.slice(lastIndex);
    for (const char of plainSegment) {
      tokens.push({
        type: 'char',
        value: char,
        width: stringWidth(char),
      });
    }
  }

  return tokens;
}

/**
 * Groups ANSI tokens into whitespace and word chunks for proper word-boundary wrapping.
 */
function groupIntoChunks(tokens: AnsiToken[]): LayoutChunk[] {
  const chunks: LayoutChunk[] = [];
  let currentChunk: LayoutChunk | null = null;

  for (const token of tokens) {
    if (token.type === 'ansi') {
      if (!currentChunk) {
        currentChunk = { isSpace: false, tokens: [], width: 0 };
      }
      currentChunk.tokens.push(token);
      continue;
    }

    const isSpace = token.value === ' ' || token.value === '\t';
    if (!currentChunk || currentChunk.isSpace !== isSpace) {
      if (currentChunk && currentChunk.tokens.length > 0) {
        chunks.push(currentChunk);
      }
      currentChunk = { isSpace, tokens: [token], width: token.width };
    } else {
      currentChunk.tokens.push(token);
      currentChunk.width += token.width;
    }
  }

  if (currentChunk && currentChunk.tokens.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Wraps `text` into lines that do not exceed `maxCols` display columns using word-boundary wrapping.
 * Automatically preserves and applies hanging indentation across wrapped lines.
 */
export function wrapVisualLine(text: string, maxCols: number): string[] {
  if (text.length === 0) return [''];
  if (maxCols <= 0) return [text];

  const plainText = stripAnsi(text);
  let continuationIndent = '';
  if (
    plainText.startsWith('  ● ') ||
    plainText.startsWith('  • ') ||
    plainText.startsWith('  * ') ||
    plainText.startsWith('  - ')
  ) {
    continuationIndent = '    ';
  } else if (plainText.startsWith('    ')) {
    continuationIndent = '    ';
  } else if (plainText.startsWith('  ')) {
    continuationIndent = '  ';
  }

  const tokens = tokenizeAnsi(text);
  const chunks = groupIntoChunks(tokens);

  const lines: string[] = [];
  let currentTokens: AnsiToken[] = [];
  let currentWidth = 0;
  let activeStyles: string[] = [];

  function updateActiveStyles(token: AnsiToken) {
    if (token.type !== 'ansi') return;
    if (token.value === '\x1b[0m' || token.value === '\x1b[39m' || token.value === '\x1b[49m') {
      if (token.value === '\x1b[0m') {
        activeStyles = [];
      } else {
        activeStyles = activeStyles.filter((s) => s !== token.value);
      }
    } else {
      activeStyles.push(token.value);
    }
  }

  function emitCurrentLine() {
    let lineStr = currentTokens.map((t) => t.value).join('');
    if (activeStyles.length > 0 && !lineStr.endsWith('\x1b[0m')) {
      lineStr += '\x1b[0m';
    }
    lines.push(lineStr);

    currentTokens = [];
    currentWidth = 0;

    // Carry forward active styles to next line
    if (activeStyles.length > 0) {
      for (const s of activeStyles) {
        currentTokens.push({ type: 'ansi', value: s, width: 0 });
      }
    }

    // Apply hanging continuation indent to next line
    if (continuationIndent) {
      for (const char of continuationIndent) {
        currentTokens.push({ type: 'char', value: char, width: 1 });
      }
      currentWidth = stringWidth(continuationIndent);
    }
  }

  for (const chunk of chunks) {
    for (const t of chunk.tokens) {
      updateActiveStyles(t);
    }

    if (chunk.isSpace) {
      // Leading whitespace (indentation) is always preserved
      if (currentWidth === 0) {
        currentTokens.push(...chunk.tokens);
        currentWidth += chunk.width;
      } else if (currentWidth + chunk.width <= maxCols) {
        currentTokens.push(...chunk.tokens);
        currentWidth += chunk.width;
      } else {
        // Trailing whitespace at end of line: emit line and drop trailing space
        emitCurrentLine();
      }
      continue;
    }

    // Word chunk (non-space)
    if (currentWidth + chunk.width <= maxCols) {
      currentTokens.push(...chunk.tokens);
      currentWidth += chunk.width;
    } else if (currentWidth > 0) {
      // Word doesn't fit on current line: wrap to new line first
      emitCurrentLine();

      if (currentWidth + chunk.width <= maxCols) {
        currentTokens.push(...chunk.tokens);
        currentWidth += chunk.width;
      } else {
        // Super-long word that exceeds maxCols on an empty line: break character-by-character
        for (const token of chunk.tokens) {
          if (token.type === 'ansi') {
            currentTokens.push(token);
            continue;
          }
          if (currentWidth + token.width > maxCols && currentWidth > 0) {
            emitCurrentLine();
          }
          currentTokens.push(token);
          currentWidth += token.width;
        }
      }
    } else {
      // Word is on an empty line and exceeds maxCols: break character-by-character
      for (const token of chunk.tokens) {
        if (token.type === 'ansi') {
          currentTokens.push(token);
          continue;
        }
        if (currentWidth + token.width > maxCols && currentWidth > 0) {
          emitCurrentLine();
        }
        currentTokens.push(token);
        currentWidth += token.width;
      }
    }
  }

  if (currentTokens.length > 0 || lines.length === 0) {
    let lineStr = currentTokens.map((t) => t.value).join('');
    if (activeStyles.length > 0 && lines.length > 0 && !lineStr.endsWith('\x1b[0m')) {
      lineStr += '\x1b[0m';
    }
    lines.push(lineStr);
  }

  return lines;
}

/**
 * Backward-compatible alias for wrapVisualLine.
 */
export function wrapByVisualWidth(text: string, maxCols: number): string[] {
  return wrapVisualLine(text, maxCols);
}

/**
 * Measures a single ComponentNode and breaks its logical lines into PhysicalRows.
 */
export function measureNode(
  node: ComponentNode,
  contentWidth: number,
  forceAll = false,
): { rows: PhysicalRow[]; cursorWithinNode: { row: number; column: number } | null } {
  const logicalLines = node.getLines(contentWidth, forceAll);
  const rows: PhysicalRow[] = [];
  const wrapSegmentCounts: number[] = [];

  for (let lIdx = 0; lIdx < logicalLines.length; lIdx++) {
    const line = logicalLines[lIdx] ?? '';
    const segments = wrapVisualLine(line, contentWidth);
    wrapSegmentCounts.push(segments.length);
    for (let sIdx = 0; sIdx < segments.length; sIdx++) {
      rows.push({
        text: segments[sIdx] ?? '',
        sourceLineIndex: lIdx,
        wrapSegmentIndex: sIdx,
      });
    }
  }

  let cursorWithinNode: { row: number; column: number } | null = null;
  if (node.getCursorPosition) {
    const pos = node.getCursorPosition();
    if (pos) {
      const logicalRow = pos.line;
      let physicalRowOffset = 0;
      for (let i = 0; i < logicalRow && i < wrapSegmentCounts.length; i++) {
        physicalRowOffset += wrapSegmentCounts[i] ?? 0;
      }
      cursorWithinNode = {
        row: physicalRowOffset,
        column: pos.column,
      };
    }
  }

  return { rows, cursorWithinNode };
}

/**
 * Lays out the complete DocumentTree into flat physical rows and absolute CellCursor.
 */
export function layoutDocument(
  tree: DocumentTree,
  contentWidth: number,
  forceAll = false,
  lineWidthCache: Map<string, number> = new Map(),
): CellLayoutResult {
  const physicalRows: PhysicalRow[] = [];
  let absoluteCursor: CellCursor | null = null;

  for (const node of tree.getNodes()) {
    const nodeStartRow = physicalRows.length;
    const { rows, cursorWithinNode } = measureNode(node, contentWidth, forceAll);

    for (const r of rows) {
      physicalRows.push(r);
    }

    if (cursorWithinNode && absoluteCursor === null) {
      absoluteCursor = {
        row: nodeStartRow + cursorWithinNode.row,
        column: cursorWithinNode.column,
      };
    }
  }

  return {
    physicalRows,
    cursor: absoluteCursor,
    totalPhysicalRows: physicalRows.length,
  };
}
