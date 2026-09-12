import type TerminalEngine from './TerminalEngine.js';

export type ComponentOverflow = 'wrap' | 'hidden';
export type ComponentTruncation = 'clip' | 'ellipsis' | 'none';

/**
 * Base Component class.
 * All UI widgets (Prompt, Docks, StreamingView, Header, StatusBar) inherit from this.
 */
export default class Component<
  Props extends Record<string, any> = any,
  State extends Record<string, any> = any,
> {
  props: Props;
  state: State;
  engine: TerminalEngine | null = null;
  _dirty = true;
  _lastWidth?: number;
  _cachedLines: string[] = [];

  /**
   * Overflow handling:
   * - 'wrap': text lines are permitted to wrap across rows (used for PromptInput, StreamingView, chat history).
   * - 'hidden': text lines must stay single-row and not expand horizontally or vertically.
   */
  overflow: ComponentOverflow = 'hidden';

  /**
   * Truncation handling:
   * - 'clip': hard truncate any line exceeding width to avoid overflowing borders or docks.
   * - 'ellipsis': truncate with ellipsis (…) if exceeding width.
   * - 'none': keep line content as-is (used when overflow: 'wrap' handles wrapping downstream).
   */
  truncation: ComponentTruncation = 'clip';

  constructor(props: Props = {} as Props) {
    this.props = props;
    this.state = {} as State;
    this.engine = null;
    this._dirty = true;
    this._cachedLines = [];
  }

  componentDidMount?(): void;
  componentWillUnmount?(): void;

  /**
   * Updates component state and schedules a reactive re-render frame.
   */
  setState(newState: Partial<State>): void {
    this.state = { ...this.state, ...newState };
    this._dirty = true;
    if (this.engine) {
      this.engine.requestFrame();
    }
  }

  /**
   * Explicitly marks component as dirty to force redraw.
   */
  markDirty(): void {
    this._dirty = true;
    if (this.engine) {
      this.engine.requestFrame();
    }
  }

  /**
   * Returns lines array, using cache if clean and width matches.
   */
  _getLines(width?: number, forceRedraw = false): string[] {
    if (this._dirty || forceRedraw || (width !== undefined && width !== this._lastWidth)) {
      this._cachedLines = this.render(width);
      this._lastWidth = width;
      this._dirty = false;
    }
    return this._cachedLines;
  }

  getLines(width?: number, forceRedraw = false): string[] {
    return this._getLines(width, forceRedraw);
  }

  /**
   * Optional: return { logicalLineIndex, characterOffsetWithinLine } for cursor placement.
   * null = no custom cursor for this component.
   * Physical row/col coordinate translation is computed canonically by cell-layout.
   */
  getLogicalCursor(): { logicalLineIndex: number; characterOffsetWithinLine: number } | null {
    return null;
  }

  /** Lifecycle hooks */
  onMount(): void {
    if (typeof this.componentDidMount === 'function') {
      this.componentDidMount();
    }
  }

  onUnmount(): void {
    if (typeof this.componentWillUnmount === 'function') {
      this.componentWillUnmount();
    }
    this.engine = null;
  }

  onResize(_newWidth: number, _newHeight: number): void {
    this.markDirty();
  }

  render(_width?: number): string[] {
    return [];
  }
}
