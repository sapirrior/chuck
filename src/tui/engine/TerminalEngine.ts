import Component from './Component.js';
import HistoryStore from './HistoryStore.js';
import StateRenderer from './StateRenderer.js';
import { DocumentTree, type ComponentNode } from './DocumentTree.js';

class ComponentNodeAdapter implements ComponentNode {
  id: string;
  kind: ComponentNode['kind'] = 'custom';
  comp: Component;

  constructor(id: string, comp: Component, kind: ComponentNode['kind'] = 'custom') {
    this.id = id;
    this.comp = comp;
    this.kind = kind;
  }

  getLines(width: number, forceAll?: boolean): string[] {
    return this.comp._getLines(width, forceAll);
  }

  getLogicalCursor(): { logicalLineIndex: number; characterOffsetWithinLine: number } | null {
    if (typeof this.comp.getLogicalCursor === 'function') {
      return this.comp.getLogicalCursor();
    }
    return null;
  }

  onMount(): void {
    if (typeof this.comp.onMount === 'function') {
      this.comp.onMount();
    }
  }

  onUnmount(): void {
    if (typeof this.comp.onUnmount === 'function') {
      this.comp.onUnmount();
    }
  }

  onResize(width: number, height: number): void {
    if (typeof this.comp.onResize === 'function') {
      this.comp.onResize(width, height);
    }
  }
}

export default class TerminalEngine {
  tree: DocumentTree;
  history: HistoryStore;
  components: Component[];
  private adapters: Map<Component, ComponentNodeAdapter>;
  private renderer: StateRenderer;
  dirty: boolean;
  cursorHidden: boolean;
  inAlternateScreen: boolean;
  scrollOffset: number;
  private resizeHandler: () => void;
  private inputHandler: (data: Buffer) => void;
  private resizeTimer: NodeJS.Timeout | null = null;
  private idCounter = 0;
  private pendingForceFull = false;
  private lineWidthCache: Map<string, number> = new Map();
  private customInputListeners: Array<(chunk: Buffer) => boolean | void> = [];

  constructor() {
    this.tree = new DocumentTree();
    this.history = new HistoryStore();
    this.components = [];
    this.adapters = new Map();
    this.renderer = new StateRenderer();
    this.dirty = false;
    this.cursorHidden = false;
    this.inAlternateScreen = false;
    this.scrollOffset = 0;

    // Window resize & zoom handler: debounced for smooth reflow
    this.resizeHandler = () => {
      this.renderer.clearPreviousFrameRecord();
      for (const comp of this.components) {
        comp.markDirty();
      }

      if (this.resizeTimer) {
        clearTimeout(this.resizeTimer);
      }
      this.resizeTimer = setTimeout(() => {
        const w = process.stdout.columns || 80;
        const h = process.stdout.rows || 24;
        this.tree.invalidateCache();
        for (const comp of this.components) {
          if (typeof comp.onResize === 'function') {
            comp.onResize(w, h);
          }
        }
        if (this.scrollOffset > 0) {
          this.scrollOffset = 0;
        }
        this.requestFrame(true);
      }, 50);
    };

    // Keyboard navigation handler
    this.inputHandler = (data: Buffer) => {
      if (!this.inAlternateScreen) return;

      const str = data.toString();

      // Consume focus tracking event escapes (Mode 1004: \x1b[I = focus in, \x1b[O = focus out)
      if (
        str === '\x1b[I' ||
        str === '\x1b[O' ||
        str.startsWith('\x1b[I') ||
        str.startsWith('\x1b[O')
      ) {
        return;
      }

      // Check registered custom input listeners first
      for (let i = this.customInputListeners.length - 1; i >= 0; i--) {
        const listener = this.customInputListeners[i];
        if (listener) {
          const handled = listener(data);
          if (handled) return;
        }
      }

      const halfPage = Math.max(1, Math.floor(((process.stdout.rows || 24) - 1) / 2));

      // PageUp / PageDown / Ctrl+U / Ctrl+D scrolling
      if (str === '\x04') {
        this.scrollDown(halfPage);
        return;
      }
      if (str === '\x15') {
        this.scrollUp(halfPage);
        return;
      }
      if (str === '\x1b[6~') {
        this.scrollDown(5);
        return;
      }
      if (str === '\x1b[5~') {
        this.scrollUp(5);
        return;
      }
    };

    // Restore terminal on unexpected exit
    process.on('exit', () => {
      this.cleanupSync();
    });
  }

  addInputListener(listener: (chunk: Buffer) => boolean | void): () => void {
    this.customInputListeners.push(listener);
    return () => {
      this.customInputListeners = this.customInputListeners.filter((l) => l !== listener);
    };
  }

  scrollUp(amount = 3): void {
    this.scrollOffset += amount;
    this.requestFrame();
  }

  scrollDown(amount = 3): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - amount);
    this.requestFrame();
  }

  scrollToBottom(): void {
    this.scrollOffset = 0;
    this.requestFrame();
  }

  ensureAlternateScreen(): void {
    if (!this.inAlternateScreen) {
      process.stdout.write('\x1b[?1049h\x1b[?1004h\x1b[?7l\x1b[H');
      this.inAlternateScreen = true;
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', this.inputHandler);
      }
      process.stdout.on('resize', this.resizeHandler);
    }
  }

  cleanupSync(): void {
    this.showCursor();
    if (this.inAlternateScreen) {
      process.stdout.write('\x1b[?7h\x1b[?1004l\x1b[?1049l');
      this.inAlternateScreen = false;
      try {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
      } catch {}
    }
  }

  async exitAlternateScreen(): Promise<void> {
    this.showCursor();
    if (this.inAlternateScreen) {
      process.stdout.write('\x1b[?7h\x1b[?1004l\x1b[?1049l');
      this.inAlternateScreen = false;
      if (process.stdin.isTTY) {
        process.stdin.off('data', this.inputHandler);
        try {
          process.stdin.setRawMode(false);
        } catch {}
        process.stdin.pause();
      }
      if (this.resizeTimer) {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = null;
      }
      process.stdout.off('resize', this.resizeHandler);
    }
  }

  hideCursor(): void {
    if (!this.cursorHidden) {
      process.stdout.write('\x1b[?25l');
      this.cursorHidden = true;
    }
  }

  showCursor(): void {
    if (this.cursorHidden) {
      process.stdout.write('\x1b[?25h');
      this.cursorHidden = false;
    }
  }

  commitPrompt(text: string): void {
    this.ensureAlternateScreen();
    this.tree.addUserMessage(text);
    this.requestFrame();
  }

  commit(
    kind:
      | 'log'
      | 'header'
      | 'footer'
      | 'tool-result'
      | 'assistant-message'
      | 'raw'
      | 'logo'
      | 'prompt'
      | 'system',
    lines: string[],
  ): void {
    this.ensureAlternateScreen();
    this.history.push(kind, lines);
    const maxReadableWidth = kind === 'assistant-message' ? 100 : undefined;
    const isWrappable = kind !== 'logo' && kind !== 'header' && kind !== 'footer';
    this.tree.addText(lines, isWrappable, maxReadableWidth);
    this.requestFrame();
  }

  mount(
    component: Component,
    options: { keepCursorVisible?: boolean; kind?: ComponentNode['kind'] } = {},
  ): void {
    this.ensureAlternateScreen();
    // If component is already mounted, unmount previous adapter first to avoid duplicate nodes
    if (this.adapters.has(component)) {
      this.unmount(component);
    }

    component.engine = this;
    this.components.push(component);

    const adapter = new ComponentNodeAdapter(
      `comp-${this.idCounter++}`,
      component,
      options.kind ?? 'custom',
    );
    this.adapters.set(component, adapter);
    this.tree.mountNode(adapter);

    if (options.keepCursorVisible) {
      this.showCursor();
    } else {
      this.hideCursor();
    }

    this.requestFrame();
  }

  unmount(component: Component): void {
    const adapter = this.adapters.get(component);
    if (adapter) {
      this.tree.unmountNode(adapter);
      this.adapters.delete(component);
    }
    this.components = this.components.filter((c) => c !== component);
    this.requestFrame();
  }

  clear(): void {
    this.renderer.clearPreviousFrameRecord();
  }

  clearAll(): void {
    this.tree.clearAll();
    this.history.clearAll();
    this.components = [];
    this.adapters.clear();
    this.renderer.clearPreviousFrameRecord();
    this.requestFrame(true);
  }

  requestFrame(forceFull = false): void {
    this.pendingForceFull = this.pendingForceFull || forceFull;
    if (this.dirty) return;
    this.dirty = true;

    process.nextTick(() => {
      if (this.dirty) {
        this.dirty = false;
        const shouldForceFull = this.pendingForceFull;
        this.pendingForceFull = false;
        if (this.inAlternateScreen) {
          const frame = this.renderer.render(
            this.tree,
            this.scrollOffset,
            shouldForceFull,
            this.lineWidthCache,
          );
          this.scrollOffset = frame.currentScrollOffset;
        }
      }
    });
  }
}
