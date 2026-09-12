import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import { appendFileSync } from 'node:fs';
import { truncateToWidth } from '../utils/format.js';
import type { ComponentNode, DocumentTree } from './DocumentTree.js';

export const MAX_READABLE_WIDTH = 100;

export function assertRowWidth(row: string, maxCols: number): string {
  if (maxCols <= 0) return '';
  const visWidth = stringWidth(stripAnsi(row));
  if (visWidth > maxCols) {
    if (process.env.DEBUG_TUI_OVERFLOW) {
      try {
        const logPath =
          process.env.DEBUG_TUI_OVERFLOW === '1'
            ? 'tui-overflow.log'
            : process.env.DEBUG_TUI_OVERFLOW;
        appendFileSync(
          logPath,
          `[TUI OVERFLOW] width=${visWidth} maxCols=${maxCols} row=${JSON.stringify(row)}\n`,
        );
      } catch {}
    }
    return truncateToWidth(row, maxCols);
  }
  return row;
}

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

export interface WrapResultWithCursor {
  segments: string[];
  cursorInLine: { segmentIndex: number; column: number } | null;
}

/**
 * Wraps `text` into lines that do not exceed `maxCols` display columns using word-boundary wrapping,
 * and simultaneously maps a logical character offset to its physical (segmentIndex, column).
 * Automatically preserves and applies hanging indentation across wrapped lines.
 */
export function wrapVisualLineWithCursor(
  text: string,
  maxCols: number,
  targetCharOffset: number | null,
): WrapResultWithCursor {
  // A logical "line" must never contain a raw line break — normalize
  // defensively; upstream producers are responsible for pre-splitting.
  text = text.replace(/\r\n|\r|\n/g, ' ');

  if (text.length === 0) {
    return {
      segments: [''],
      cursorInLine: targetCharOffset !== null ? { segmentIndex: 0, column: 1 } : null,
    };
  }
  if (maxCols <= 0) {
    return {
      segments: [text],
      cursorInLine:
        targetCharOffset !== null
          ? {
              segmentIndex: 0,
              column: 1 + stringWidth(stripAnsi(text).slice(0, targetCharOffset)),
            }
          : null,
    };
  }

  const plainText = stripAnsi(text);
  let continuationIndent = '';
  if (
    plainText.startsWith(' ● ') ||
    plainText.startsWith(' • ') ||
    plainText.startsWith(' * ') ||
    plainText.startsWith(' - ')
  ) {
    continuationIndent = '   ';
  } else if (
    plainText.startsWith('  ● ') ||
    plainText.startsWith('  • ') ||
    plainText.startsWith('  * ') ||
    plainText.startsWith('  - ')
  ) {
    continuationIndent = '    ';
  } else if (plainText.startsWith('    ')) {
    continuationIndent = '    ';
  } else if (plainText.startsWith('   ')) {
    continuationIndent = '   ';
  } else if (
    plainText.startsWith('  ') ||
    plainText.startsWith('> ') ||
    plainText.startsWith('❯ ') ||
    plainText.startsWith('› ') ||
    plainText.startsWith('! ')
  ) {
    continuationIndent = '  ';
  }

  const tokens = tokenizeAnsi(text);
  const chunks = groupIntoChunks(tokens);

  const lines: string[] = [];
  let currentTokens: AnsiToken[] = [];
  let currentWidth = 0;
  let activeFg: string | null = null;
  let activeBg: string | null = null;
  const activeModifiers = new Set<string>();

  let plainCharIndex = 0;
  let cursorFound = false;
  let cursorSegment = 0;
  let cursorColumn = 1;

  function updateActiveStyles(token: AnsiToken) {
    if (token.type !== 'ansi') return;
    const match = token.value.match(/^\x1b\[([0-9;]*)m$/);
    if (!match) return;

    const rawParams = match[1] || '0';
    const params = rawParams.split(';').map((p) => parseInt(p, 10) || 0);

    let i = 0;
    while (i < params.length) {
      const code = params[i] ?? 0;

      if (code === 0) {
        activeFg = null;
        activeBg = null;
        activeModifiers.clear();
      } else if (
        code === 1 ||
        code === 2 ||
        code === 3 ||
        code === 4 ||
        code === 7 ||
        code === 8 ||
        code === 9
      ) {
        activeModifiers.add(`\x1b[${code}m`);
      } else if (code === 22) {
        activeModifiers.delete('\x1b[1m');
        activeModifiers.delete('\x1b[2m');
      } else if (code === 23) {
        activeModifiers.delete('\x1b[3m');
      } else if (code === 24) {
        activeModifiers.delete('\x1b[4m');
      } else if (code === 27) {
        activeModifiers.delete('\x1b[7m');
      } else if (code === 28) {
        activeModifiers.delete('\x1b[8m');
      } else if (code === 29) {
        activeModifiers.delete('\x1b[9m');
      } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
        activeFg = `\x1b[${code}m`;
      } else if (code === 38) {
        if (params[i + 1] === 5 && i + 2 < params.length) {
          activeFg = `\x1b[38;5;${params[i + 2]}m`;
          i += 2;
        } else if (params[i + 1] === 2 && i + 4 < params.length) {
          activeFg = `\x1b[38;2;${params[i + 2]};${params[i + 3]};${params[i + 4]}m`;
          i += 4;
        }
      } else if (code === 39) {
        activeFg = null;
      } else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
        activeBg = `\x1b[${code}m`;
      } else if (code === 48) {
        if (params[i + 1] === 5 && i + 2 < params.length) {
          activeBg = `\x1b[48;5;${params[i + 2]}m`;
          i += 2;
        } else if (params[i + 1] === 2 && i + 4 < params.length) {
          activeBg = `\x1b[48;2;${params[i + 2]};${params[i + 3]};${params[i + 4]}m`;
          i += 4;
        }
      } else if (code === 49) {
        activeBg = null;
      }

      i++;
    }
  }

  function getActiveStyleCodes(): string[] {
    const codes: string[] = [];
    if (activeFg) codes.push(activeFg);
    if (activeBg) codes.push(activeBg);
    for (const mod of activeModifiers) {
      codes.push(mod);
    }
    return codes;
  }

  function emitCurrentLine() {
    const activeStyles = getActiveStyleCodes();
    let lineStr = currentTokens.map((t) => t.value).join('');
    if (activeStyles.length > 0 && !lineStr.endsWith('\x1b[0m')) {
      lineStr += '\x1b[0m';
    }
    lines.push(lineStr);

    currentTokens = [];
    currentWidth = 0;

    // Carry forward active styles to next line with a reset followed by active styles
    if (activeStyles.length > 0) {
      currentTokens.push({ type: 'ansi', value: '\x1b[0m', width: 0 });
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

  function checkCursorAtCurrentToken() {
    if (targetCharOffset !== null && !cursorFound && plainCharIndex === targetCharOffset) {
      cursorFound = true;
      cursorSegment = lines.length;
      cursorColumn = 1 + currentWidth;
    }
  }

  for (const chunk of chunks) {
    for (const t of chunk.tokens) {
      updateActiveStyles(t);
    }

    if (chunk.isSpace) {
      // Leading whitespace (indentation) is always preserved
      if (currentWidth === 0) {
        for (const token of chunk.tokens) {
          if (token.type === 'char') {
            checkCursorAtCurrentToken();
            plainCharIndex++;
          }
          currentTokens.push(token);
          currentWidth += token.width;
        }
      } else if (currentWidth + chunk.width <= maxCols) {
        for (const token of chunk.tokens) {
          if (token.type === 'char') {
            checkCursorAtCurrentToken();
            plainCharIndex++;
          }
          currentTokens.push(token);
          currentWidth += token.width;
        }
      } else {
        // Trailing whitespace at end of line: emit line and drop trailing space
        for (const token of chunk.tokens) {
          if (token.type === 'char') {
            checkCursorAtCurrentToken();
            plainCharIndex++;
          }
        }
        emitCurrentLine();
      }
      continue;
    }

    // Word chunk (non-space)
    if (currentWidth + chunk.width <= maxCols) {
      for (const token of chunk.tokens) {
        if (token.type === 'char') {
          checkCursorAtCurrentToken();
          plainCharIndex++;
        }
        currentTokens.push(token);
        currentWidth += token.width;
      }
    } else if (currentWidth > 0) {
      // Word doesn't fit on current line: wrap to new line first
      emitCurrentLine();

      if (currentWidth + chunk.width <= maxCols) {
        for (const token of chunk.tokens) {
          if (token.type === 'char') {
            checkCursorAtCurrentToken();
            plainCharIndex++;
          }
          currentTokens.push(token);
          currentWidth += token.width;
        }
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
          checkCursorAtCurrentToken();
          plainCharIndex++;
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
        checkCursorAtCurrentToken();
        plainCharIndex++;
        currentTokens.push(token);
        currentWidth += token.width;
      }
    }
  }

  if (currentTokens.length > 0 || lines.length === 0) {
    const activeStyles = getActiveStyleCodes();
    let lineStr = currentTokens.map((t) => t.value).join('');
    if (activeStyles.length > 0 && lines.length > 0 && !lineStr.endsWith('\x1b[0m')) {
      lineStr += '\x1b[0m';
    }
    lines.push(lineStr);
  }

  if (targetCharOffset !== null && !cursorFound) {
    cursorSegment = Math.max(0, lines.length - 1);
    cursorColumn = 1 + currentWidth;
    cursorFound = true;
  }

  return {
    segments: lines,
    cursorInLine:
      targetCharOffset !== null ? { segmentIndex: cursorSegment, column: cursorColumn } : null,
  };
}

/**
 * Wraps `text` into lines that do not exceed `maxCols` display columns using word-boundary wrapping.
 * Automatically preserves and applies hanging indentation across wrapped lines.
 */
export function wrapVisualLine(text: string, maxCols: number): string[] {
  return wrapVisualLineWithCursor(text, maxCols, null).segments;
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
  const isWrappable = 'wrappable' in node ? Boolean((node as any).wrappable) : true;
  const logicalCursor = node.getLogicalCursor ? node.getLogicalCursor() : null;

  let cursorWithinNode: { row: number; column: number } | null = null;

  for (let lIdx = 0; lIdx < logicalLines.length; lIdx++) {
    const line = logicalLines[lIdx] ?? '';
    const targetCharOffset =
      logicalCursor && logicalCursor.logicalLineIndex === lIdx
        ? logicalCursor.characterOffsetWithinLine
        : null;

    const { segments, cursorInLine } = isWrappable
      ? wrapVisualLineWithCursor(line, contentWidth, targetCharOffset)
      : {
          segments: [line],
          cursorInLine:
            targetCharOffset !== null
              ? {
                  segmentIndex: 0,
                  column: 1 + stringWidth(stripAnsi(line).slice(0, targetCharOffset)),
                }
              : null,
        };

    const lineStartRow = rows.length;
    for (let sIdx = 0; sIdx < segments.length; sIdx++) {
      rows.push({
        text: assertRowWidth(segments[sIdx] ?? '', contentWidth),
        sourceLineIndex: lIdx,
        wrapSegmentIndex: sIdx,
      });
    }

    if (cursorInLine && cursorWithinNode === null) {
      cursorWithinNode = {
        row: lineStartRow + cursorInLine.segmentIndex,
        column: cursorInLine.column,
      };
    }
  }

  return { rows, cursorWithinNode };
}

/**
 * Lays out the complete DocumentTree into flat physical rows and absolute CellCursor.
 * Uses persistent immutable history row caching for sub-millisecond live updates.
 */
export function layoutDocument(
  tree: DocumentTree,
  contentWidth: number,
  forceAll = false,
  _lineWidthCache: Map<string, number> = new Map(),
): CellLayoutResult {
  const hasHistoryCache =
    typeof tree.getHistoryRows === 'function' && typeof tree.getLiveNodes === 'function';

  let physicalRows: PhysicalRow[];
  let nodesToMeasure: ComponentNode[];

  if (hasHistoryCache) {
    const historyRows = tree.getHistoryRows(contentWidth, forceAll);
    physicalRows = [...historyRows];
    nodesToMeasure = tree.getLiveNodes();
  } else {
    physicalRows = [];
    nodesToMeasure = typeof tree.getNodes === 'function' ? tree.getNodes() : [];
  }

  let absoluteCursor: CellCursor | null = null;

  for (const node of nodesToMeasure) {
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
