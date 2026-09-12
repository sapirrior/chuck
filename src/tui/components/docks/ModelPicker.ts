import Component from '../../engine/Component.js';
import type { ModelDescriptor } from '../../../models/discovery.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk, stripAnsi, truncateToWidth } from '../../utils/format.js';
import stringWidth from 'string-width';

import { box, text, Justify, type LayoutNode } from '../../layout/index.js';

export interface ModelPickerProps {
  models: ModelDescriptor[];
  currentModel: { provider: string; modelId: string };
  onSelect: (model: ModelDescriptor) => void;
  onCancel: () => void;
}

export interface ModelPickerState {
  selectedIdx: number;
  query: string;
}

export default class ModelPicker extends Component<ModelPickerProps, ModelPickerState> {
  private removeInputListener: (() => void) | null = null;

  constructor(props: ModelPickerProps) {
    super(props);
    this.state = {
      selectedIdx: 0,
      query: '',
    };
  }

  private getFiltered(): ModelDescriptor[] {
    const { query } = this.state;
    const { models } = this.props;
    if (!query) return models;
    const q = query.toLowerCase();
    return models.filter(
      (m) => m.model_id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
    );
  }

  override componentDidMount(): void {
    if (!this.engine) return;

    this.removeInputListener = this.engine.addInputListener((chunk) => {
      const str = chunk.toString();
      const filtered = this.getFiltered();

      // Escape -> cancel
      if (str === '\x1b') {
        this.props.onCancel();
        return true;
      }

      // Enter -> select
      if (str === '\r' || str === '\n') {
        const chosen = filtered[this.state.selectedIdx];
        if (chosen) {
          this.props.onSelect(chosen);
        }
        return true;
      }

      // Up arrow
      if (str === '\x1b[A') {
        this.setState({
          selectedIdx:
            this.state.selectedIdx > 0 ? this.state.selectedIdx - 1 : filtered.length - 1,
        });
        return true;
      }

      // Down arrow
      if (str === '\x1b[B') {
        this.setState({
          selectedIdx:
            this.state.selectedIdx < filtered.length - 1 ? this.state.selectedIdx + 1 : 0,
        });
        return true;
      }

      // Backspace (\x7f or \x08)
      if (str === '\x7f' || str === '\x08') {
        if (this.state.query.length > 0) {
          this.setState({
            query: this.state.query.slice(0, -1),
            selectedIdx: 0,
          });
        }
        return true;
      }

      // Regular character input
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

  override renderLayout(width?: number): LayoutNode {
    const theme = getTheme();
    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(0, termWidth - 1);
    const dividerWidth = Math.max(1, Math.min(termWidth - 4, maxCols));
    const { currentModel } = this.props;
    const { selectedIdx, query } = this.state;
    const filtered = this.getFiltered();

    const lavHeader = themeColor(theme.lavenderHeader);
    const infoColor = themeColor(theme.info);
    const dashRule = themeColor(theme.dashedRule);

    const rows: LayoutNode[] = [
      text(lavHeader(figures.horizontalLine.repeat(dividerWidth))),
      box(
        { direction: 'row', width: '100%', justify: Justify.SpaceBetween, overflow: 'hidden' },
        text(infoColor('Select Model'), { flexShrink: 0 }),
        text(chalk.dim(`Current: ${currentModel.provider}/${currentModel.modelId}`), {
          flexShrink: 1,
          wrappable: false,
        }),
      ),
      text(
        `${infoColor(`${figures.pointer} `)}${query ? chalk.white(query) : chalk.dim('Type to filter models…')}`,
      ),
      text(dashRule(figures.horizontalLine.repeat(dividerWidth))),
    ];

    if (filtered.length === 0) {
      rows.push(text(chalk.dim(`  No models matching "${query}".`)));
    } else {
      const visibleCount = 8;
      const startIdx = Math.max(
        0,
        Math.min(selectedIdx - Math.floor(visibleCount / 2), filtered.length - visibleCount),
      );
      const visibleModels = filtered.slice(
        Math.max(0, startIdx),
        Math.max(0, startIdx) + visibleCount,
      );

      for (let relativeIdx = 0; relativeIdx < visibleModels.length; relativeIdx++) {
        const m = visibleModels[relativeIdx]!;
        const actualIdx = Math.max(0, startIdx) + relativeIdx;
        const isSelected = actualIdx === selectedIdx;
        const isCurrent =
          m.provider === currentModel.provider && m.model_id === currentModel.modelId;

        const p = isSelected ? infoColor(`${figures.pointer} `) : '  ';
        const modelText = isSelected ? infoColor(m.model_id) : chalk.dim(m.model_id);
        const activeBadge = isCurrent ? chalk.green(' (active)') : '';

        let badge = `[${m.provider.toUpperCase()}]`;
        if (m.provider === 'anthropic') badge = '[ANTHROPIC]';
        if (m.provider === 'openai') badge = '[OPENAI]';
        if (m.provider === 'gemini') badge = '[GEMINI]';

        rows.push(
          box(
            { direction: 'row', width: '100%', justify: Justify.SpaceBetween, overflow: 'hidden' },
            text(`${p}${modelText}${activeBadge}`, { flexShrink: 1, wrappable: false }),
            text(chalk.dim(badge), { flexShrink: 0 }),
          ),
        );
      }
    }

    rows.push(
      text(
        `${chalk.dim.italic('↑/↓ navigate · Enter select · Esc cancel')}  ${chalk.dim(`${filtered.length} models available`)}`,
      ),
    );

    return box({ direction: 'column', width: '100%', overflow: 'hidden' }, ...rows);
  }

  override render(width?: number): string[] {
    const theme = getTheme();
    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(0, termWidth - 1);
    const dividerWidth = Math.max(1, Math.min(termWidth - 4, maxCols));
    const { currentModel } = this.props;
    const { selectedIdx, query } = this.state;
    const filtered = this.getFiltered();

    const lines: string[] = [];
    const lavHeader = themeColor(theme.lavenderHeader);
    const infoColor = themeColor(theme.info);
    const dashRule = themeColor(theme.dashedRule);

    lines.push(lavHeader(figures.horizontalLine.repeat(dividerWidth)));

    const titleLeft = infoColor('Select Model');
    const titleRight = chalk.dim(`Current: ${currentModel.provider}/${currentModel.modelId}`);
    const spCount = Math.max(
      1,
      maxCols - stringWidth(stripAnsi(titleLeft)) - stringWidth(stripAnsi(titleRight)),
    );
    lines.push(`${titleLeft}${' '.repeat(spCount)}${titleRight}`);

    // Search query box
    const pointer = infoColor(`${figures.pointer} `);
    const queryDisplay = query ? chalk.white(query) : chalk.dim('Type to filter models…');
    lines.push(`${pointer}${queryDisplay}`);

    lines.push(dashRule(figures.horizontalLine.repeat(dividerWidth)));

    if (filtered.length === 0) {
      lines.push(chalk.dim(`  No models matching "${query}".`));
    } else {
      const visibleCount = 8;
      const startIdx = Math.max(
        0,
        Math.min(selectedIdx - Math.floor(visibleCount / 2), filtered.length - visibleCount),
      );
      const visibleModels = filtered.slice(
        Math.max(0, startIdx),
        Math.max(0, startIdx) + visibleCount,
      );

      for (let relativeIdx = 0; relativeIdx < visibleModels.length; relativeIdx++) {
        const m = visibleModels[relativeIdx]!;
        const actualIdx = Math.max(0, startIdx) + relativeIdx;
        const isSelected = actualIdx === selectedIdx;
        const isCurrent =
          m.provider === currentModel.provider && m.model_id === currentModel.modelId;

        const p = isSelected ? infoColor(`${figures.pointer} `) : '  ';
        const modelText = isSelected ? infoColor(m.model_id) : chalk.dim(m.model_id);
        const activeBadge = isCurrent ? chalk.green(' (active)') : '';

        let badge = `[${m.provider.toUpperCase()}]`;
        if (m.provider === 'anthropic') badge = '[ANTHROPIC]';
        if (m.provider === 'openai') badge = '[OPENAI]';
        if (m.provider === 'gemini') badge = '[GEMINI]';

        const leftStr = `${p}${modelText}${activeBadge}`;
        const rightStr = chalk.dim(badge);
        const pad = Math.max(
          1,
          maxCols - stringWidth(stripAnsi(leftStr)) - stringWidth(stripAnsi(rightStr)),
        );
        lines.push(`${leftStr}${' '.repeat(pad)}${rightStr}`);
      }
    }

    lines.push(
      `${chalk.dim.italic('↑/↓ navigate · Enter select · Esc cancel')}  ${chalk.dim(`${filtered.length} models available`)}`,
    );

    return lines.map((l) => truncateToWidth(l, maxCols));
  }
}
