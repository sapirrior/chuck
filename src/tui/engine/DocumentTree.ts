import { wrapVisualLine, measureNode, type PhysicalRow } from './cell-layout.js';
import { formatUserMessage } from '../utils/message-formatter.js';
import { historyLayoutCache } from './HistoryLayoutCache.js';

export interface ComponentNode {
  id: string;
  kind: 'text' | 'spinner' | 'input' | 'select' | 'dock' | 'custom';
  wrap: boolean;
  clip: boolean;
  ellipsis?: boolean;
  hangingIndent?: number;
  getLines(width: number, forceAll?: boolean): string[];
  /**
   * Optional: logical cursor location { logicalLineIndex, characterOffsetWithinLine }.
   * logicalLineIndex: 0-indexed index into the lines returned by getLines(width).
   * characterOffsetWithinLine: character offset within that rendered logical line.
   */
  getLogicalCursor?(): { logicalLineIndex: number; characterOffsetWithinLine: number } | null;
  onMount?(): void;
  onUnmount?(): void;
  onResize?(width: number, height: number): void;
}

export class TextNode implements ComponentNode {
  id: string;
  kind: 'text' = 'text';
  lines: string[];
  wrap: boolean;
  clip: boolean;
  ellipsis?: boolean;
  hangingIndent?: number;
  maxReadableWidth?: number;
  private _cachedWidth = -1;
  private _cachedWrapped: string[] = [];

  constructor(
    id: string,
    lines: string[],
    wrap = true,
    maxReadableWidth?: number,
    hangingIndent?: number,
    clip = false,
    ellipsis = false,
  ) {
    this.id = id;
    this.lines = lines;
    this.wrap = wrap;
    this.clip = clip;
    this.ellipsis = ellipsis;
    this.maxReadableWidth = maxReadableWidth;
    this.hangingIndent = hangingIndent;
  }

  invalidateCache(): void {
    this._cachedWidth = -1;
    this._cachedWrapped = [];
  }

  getLines(width: number, forceAll = false): string[] {
    if (!this.wrap) return this.lines;
    const effectiveWidth = this.maxReadableWidth ? Math.min(width, this.maxReadableWidth) : width;
    if (!forceAll && effectiveWidth === this._cachedWidth) return this._cachedWrapped;
    this._cachedWidth = effectiveWidth;
    this._cachedWrapped = this.lines.flatMap((line) =>
      wrapVisualLine(line, effectiveWidth, this.hangingIndent ?? 0),
    );
    return this._cachedWrapped;
  }
}

export class ResponsiveHistoryNode implements ComponentNode {
  id: string;
  kind: 'custom' = 'custom';
  renderFn: (width: number) => string[];
  wrap: boolean;
  clip: boolean;
  ellipsis?: boolean;
  hangingIndent?: number;
  private _cachedWidth = -1;
  private _cachedLines: string[] = [];

  constructor(
    id: string,
    renderFn: (width: number) => string[],
    wrap = false,
    clip = true,
    hangingIndent?: number,
  ) {
    this.id = id;
    this.renderFn = renderFn;
    this.wrap = wrap;
    this.clip = clip;
    this.hangingIndent = hangingIndent;
  }

  invalidateCache(): void {
    this._cachedWidth = -1;
    this._cachedLines = [];
  }

  getLines(width: number, forceAll = false): string[] {
    if (!forceAll && width === this._cachedWidth && this._cachedLines.length > 0) {
      return this._cachedLines;
    }
    this._cachedWidth = width;
    this._cachedLines = this.renderFn(width);
    return this._cachedLines;
  }
}

export class UserMessageNode implements ComponentNode {
  id: string;
  kind: 'custom' = 'custom';
  content: string;
  wrap = false;
  clip = true;
  ellipsis = false;
  private _cachedWidth = -1;
  private _cachedColumns = -1;
  private _cachedLines: string[] = [];

  constructor(id: string, content: string) {
    this.id = id;
    this.content = content;
  }

  invalidateCache(): void {
    this._cachedWidth = -1;
    this._cachedColumns = -1;
    this._cachedLines = [];
  }

  getLines(width: number, forceAll = false): string[] {
    const termCols = process.stdout.columns || 80;
    if (
      !forceAll &&
      width === this._cachedWidth &&
      termCols === this._cachedColumns &&
      this._cachedLines.length > 0
    ) {
      return this._cachedLines;
    }
    this._cachedWidth = width;
    this._cachedColumns = termCols;
    this._cachedLines = formatUserMessage(this.content, width);
    return this._cachedLines;
  }
}

export class DocumentTree {
  private historyNodes: (TextNode | UserMessageNode | ComponentNode)[] = [];
  private liveNodes: ComponentNode[] = [];
  private idCounter = 0;
  private cachedHistoryRows: PhysicalRow[] = [];
  private lastHistoryWidth = -1;

  addText(
    lines: string[],
    wrap = true,
    maxReadableWidth?: number,
    hangingIndent?: number,
    clip = false,
    ellipsis = false,
  ): TextNode {
    const node = new TextNode(
      `node-${this.idCounter++}`,
      lines,
      wrap,
      maxReadableWidth,
      hangingIndent,
      clip,
      ellipsis,
    );
    this.historyNodes.push(node);
    if (this.lastHistoryWidth > 0) {
      const cached = historyLayoutCache.getOrCompute(node.id, this.lastHistoryWidth, () => {
        const { rows } = measureNode(node, this.lastHistoryWidth);
        return rows;
      });
      for (const r of cached.physicalRows) {
        this.cachedHistoryRows.push(r);
      }
    }
    return node;
  }

  addUserMessage(content: string): UserMessageNode {
    const node = new UserMessageNode(`user-node-${this.idCounter++}`, content);
    this.historyNodes.push(node);
    if (this.lastHistoryWidth > 0) {
      const cached = historyLayoutCache.getOrCompute(node.id, this.lastHistoryWidth, () => {
        const { rows } = measureNode(node, this.lastHistoryWidth);
        return rows;
      });
      for (const r of cached.physicalRows) {
        this.cachedHistoryRows.push(r);
      }
    }
    return node;
  }

  addResponsive(
    renderFn: (width: number) => string[],
    wrap = false,
    clip = true,
    hangingIndent?: number,
  ): ResponsiveHistoryNode {
    const node = new ResponsiveHistoryNode(
      `resp-node-${this.idCounter++}`,
      renderFn,
      wrap,
      clip,
      hangingIndent,
    );
    this.historyNodes.push(node);
    if (this.lastHistoryWidth > 0) {
      const cached = historyLayoutCache.getOrCompute(node.id, this.lastHistoryWidth, () => {
        const { rows } = measureNode(node, this.lastHistoryWidth);
        return rows;
      });
      for (const r of cached.physicalRows) {
        this.cachedHistoryRows.push(r);
      }
    }
    return node;
  }

  mountNode(node: ComponentNode): void {
    if (!this.liveNodes.includes(node)) {
      this.liveNodes.push(node);
      if (typeof node.onMount === 'function') {
        node.onMount();
      }
    }
  }

  unmountNode(node: ComponentNode): void {
    if (typeof node.onUnmount === 'function') {
      node.onUnmount();
    }
    this.liveNodes = this.liveNodes.filter((n) => n !== node);
  }

  getLiveNodes(): ComponentNode[] {
    return this.liveNodes;
  }

  getHistoryNodes(): ComponentNode[] {
    return this.historyNodes;
  }

  getNodes(): ComponentNode[] {
    return [...this.historyNodes, ...this.liveNodes];
  }

  getHistoryRows(contentWidth: number, forceAll = false): PhysicalRow[] {
    if (!forceAll && contentWidth === this.lastHistoryWidth && this.cachedHistoryRows.length > 0) {
      return this.cachedHistoryRows;
    }

    this.lastHistoryWidth = contentWidth;
    this.cachedHistoryRows = [];
    for (const node of this.historyNodes) {
      const cached = historyLayoutCache.getOrCompute(node.id, contentWidth, () => {
        const { rows } = measureNode(node, contentWidth, forceAll);
        return rows;
      });
      for (const r of cached.physicalRows) {
        this.cachedHistoryRows.push(r);
      }
    }
    return this.cachedHistoryRows;
  }

  invalidateCache(): void {
    if (this.lastHistoryWidth > 0) {
      historyLayoutCache.invalidateWidth(this.lastHistoryWidth);
    }
    this.lastHistoryWidth = -1;
    this.cachedHistoryRows = [];
    for (const node of this.historyNodes) {
      if ('invalidateCache' in node && typeof (node as any).invalidateCache === 'function') {
        (node as any).invalidateCache();
      }
    }
  }

  clearHistory(): void {
    historyLayoutCache.clear();
    this.historyNodes = [];
    this.cachedHistoryRows = [];
    this.lastHistoryWidth = -1;
  }

  clearAll(): void {
    historyLayoutCache.clear();
    for (const node of this.liveNodes) {
      if (typeof node.onUnmount === 'function') {
        node.onUnmount();
      }
    }
    this.historyNodes = [];
    this.liveNodes = [];
    this.cachedHistoryRows = [];
    this.lastHistoryWidth = -1;
  }
}
