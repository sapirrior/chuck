import type TerminalEngine from './TerminalEngine.js';

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
  _cachedLines: string[] = [];

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
   * Returns lines array, using cache if clean.
   */
  _getLines(forceRedraw = false): string[] {
    if (this._dirty || forceRedraw) {
      this._cachedLines = this.render();
      this._dirty = false;
    }
    return this._cachedLines;
  }

  /**
   * Optional: return { line, column } for cursor placement.
   * null = no custom cursor for this component.
   */
  getCursorPosition(): { line: number; column: number } | null {
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

  render(): string[] {
    return [];
  }
}
