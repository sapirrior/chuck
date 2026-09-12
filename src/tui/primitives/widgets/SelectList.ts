import Component from '../../engine/Component.js';
import { renderModalBox } from './ModalBox.js';
import type { BoxElement } from '../Box.js';
import type { TextElement } from '../Text.js';

export interface SelectListProps<T> {
  items: T[];
  title: string;
  subtitle?: string;
  placeholder?: string;
  searchFilter?: (item: T, query: string) => boolean;
  renderItem: (item: T, isSelected: boolean, maxCols: number) => BoxElement | TextElement | string;
  onSelect: (item: T) => void;
  onCancel: () => void;
  maxVisible?: number;
  emptyMessage?: string;
}

export interface SelectListState {
  selectedIdx: number;
  query: string;
}

export class SelectList<T> extends Component<SelectListProps<T>, SelectListState> {
  override overflow = 'hidden' as const;
  override truncation = 'clip' as const;

  private removeInputListener: (() => void) | null = null;

  constructor(props: SelectListProps<T>) {
    super(props);
    this.state = {
      selectedIdx: 0,
      query: '',
    };
  }

  getFiltered(): T[] {
    const { query } = this.state;
    const { items, searchFilter } = this.props;
    if (!query || !searchFilter) return items;
    return items.filter((item) => searchFilter(item, query.toLowerCase()));
  }

  override componentDidMount(): void {
    if (!this.engine) return;

    this.removeInputListener = this.engine.addInputListener((chunk) => {
      const str = chunk.toString();
      const filtered = this.getFiltered();

      if (str === '\x1b') {
        this.props.onCancel();
        return true;
      }

      if (str === '\r' || str === '\n') {
        const chosen = filtered[this.state.selectedIdx];
        if (chosen) {
          this.props.onSelect(chosen);
        }
        return true;
      }

      if (str === '\x1b[A') {
        this.setState({
          selectedIdx:
            this.state.selectedIdx > 0 ? this.state.selectedIdx - 1 : filtered.length - 1,
        });
        return true;
      }

      if (str === '\x1b[B') {
        this.setState({
          selectedIdx:
            this.state.selectedIdx < filtered.length - 1 ? this.state.selectedIdx + 1 : 0,
        });
        return true;
      }

      if (str === '\x7f' || str === '\x08') {
        if (this.state.query.length > 0) {
          this.setState({
            query: this.state.query.slice(0, -1),
            selectedIdx: 0,
          });
        }
        return true;
      }

      if (str.length === 1 && str.charCodeAt(0) >= 32) {
        this.setState({
          query: this.state.query + str,
          selectedIdx: 0,
        });
        return true;
      }

      return false;
    });
  }

  override componentWillUnmount(): void {
    if (this.removeInputListener) {
      this.removeInputListener();
      this.removeInputListener = null;
    }
  }

  override render(width?: number): string[] {
    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(1, termWidth - 1);
    const { title, subtitle, placeholder, maxVisible = 8, emptyMessage } = this.props;
    const { selectedIdx, query } = this.state;
    const filtered = this.getFiltered();

    const content: (BoxElement | TextElement | string)[] = [];

    if (filtered.length === 0) {
      content.push(emptyMessage ?? `  No items matching "${query}".`);
    } else {
      const visibleCount = maxVisible;
      const startIdx = Math.max(
        0,
        Math.min(selectedIdx - Math.floor(visibleCount / 2), filtered.length - visibleCount),
      );
      const visibleItems = filtered.slice(
        Math.max(0, startIdx),
        Math.max(0, startIdx) + visibleCount,
      );

      for (let relIdx = 0; relIdx < visibleItems.length; relIdx++) {
        const item = visibleItems[relIdx]!;
        const actualIdx = Math.max(0, startIdx) + relIdx;
        const isSelected = actualIdx === selectedIdx;
        content.push(this.props.renderItem(item, isSelected, maxCols));
      }
    }

    return renderModalBox({
      title,
      subtitle,
      queryInput: {
        query,
        placeholder: placeholder ?? 'Type to filter…',
      },
      content,
      footer: `↑/↓ navigate · Enter select · Esc cancel  (${filtered.length} available)`,
      width: termWidth,
    });
  }
}
