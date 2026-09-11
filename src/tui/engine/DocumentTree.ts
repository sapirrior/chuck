import { wrapVisualLine } from './cell-layout.js';
import { formatUserMessage } from '../utils/message-formatter.js';

export interface ComponentNode {
  id: string;
  kind: 'text' | 'spinner' | 'input' | 'select' | 'dock' | 'custom';
  getLines(width: number, forceAll?: boolean): string[];
  /**
   * Optional: physical row and column relative to this node's own physical rows.
   * line: 0-indexed physical row within this node's rendered physical rows.
   * column: 1-indexed column.
   */
  getCursorPosition?(): { line: number; column: number } | null;
  onMount?(): void;
  onUnmount?(): void;
  onResize?(width: number, height: number): void;
}

export class TextNode implements ComponentNode {
  id: string;
  kind: 'text' = 'text';
  lines: string[];
  wrappable: boolean;
  maxReadableWidth?: number;
  private _cachedWidth = -1;
  private _cachedWrapped: string[] = [];

  constructor(id: string, lines: string[], wrappable = true, maxReadableWidth?: number) {
    this.id = id;
    this.lines = lines;
    this.wrappable = wrappable;
    this.maxReadableWidth = maxReadableWidth;
  }

  invalidateCache(): void {
    this._cachedWidth = -1;
    this._cachedWrapped = [];
  }

  getLines(width: number, forceAll = false): string[] {
    if (!this.wrappable) return this.lines;
    const effectiveWidth = this.maxReadableWidth ? Math.min(width, this.maxReadableWidth) : width;
    if (!forceAll && effectiveWidth === this._cachedWidth) return this._cachedWrapped;
    this._cachedWidth = effectiveWidth;
    this._cachedWrapped = this.lines.flatMap((line) => wrapVisualLine(line, effectiveWidth));
    return this._cachedWrapped;
  }
}

export class UserMessageNode implements ComponentNode {
  id: string;
  kind: 'custom' = 'custom';
  content: string;
  isBash: boolean;
  wrappable = false;
  private _cachedWidth = -1;
  private _cachedColumns = -1;
  private _cachedLines: string[] = [];

  constructor(id: string, content: string, isBash = false) {
    this.id = id;
    this.content = content;
    this.isBash = isBash;
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
    this._cachedLines = formatUserMessage(this.content, this.isBash, width);
    return this._cachedLines;
  }
}

export class DocumentTree {
  private historyNodes: (TextNode | UserMessageNode | ComponentNode)[] = [];
  private liveNodes: ComponentNode[] = [];
  private idCounter = 0;

  addText(lines: string[], wrappable = true, maxReadableWidth?: number): TextNode {
    const node = new TextNode(`node-${this.idCounter++}`, lines, wrappable, maxReadableWidth);
    this.historyNodes.push(node);
    return node;
  }

  addUserMessage(content: string, isBash = false): UserMessageNode {
    const node = new UserMessageNode(`user-node-${this.idCounter++}`, content, isBash);
    this.historyNodes.push(node);
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

  getNodes(): ComponentNode[] {
    return [...this.historyNodes, ...this.liveNodes];
  }

  invalidateCache(): void {
    for (const node of this.historyNodes) {
      if ('invalidateCache' in node && typeof (node as any).invalidateCache === 'function') {
        (node as any).invalidateCache();
      }
    }
  }

  clearHistory(): void {
    this.historyNodes = [];
  }

  clearAll(): void {
    for (const node of this.liveNodes) {
      if (typeof node.onUnmount === 'function') {
        node.onUnmount();
      }
    }
    this.historyNodes = [];
    this.liveNodes = [];
  }
}
