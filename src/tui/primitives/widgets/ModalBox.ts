import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk } from '../../utils/format.js';
import { Box, BoxElement } from '../Box.js';
import { Text, TextElement } from '../Text.js';

export interface ModalBoxOptions {
  title: string;
  subtitle?: string;
  queryInput?: { query: string; placeholder: string };
  content: (BoxElement | TextElement | string)[];
  footer?: string;
  width?: number;
}

export function renderModalBox(options: ModalBoxOptions): string[] {
  const theme = getTheme();
  const termWidth = options.width ?? process.stdout.columns ?? 80;
  const maxCols = Math.max(1, termWidth - 1);
  const dividerWidth = Math.max(1, Math.min(termWidth - 4, maxCols));

  const lavHeader = themeColor(theme.lavenderHeader);
  const infoColor = themeColor(theme.info);
  const dashRule = themeColor(theme.dashedRule);

  const elements: (BoxElement | TextElement | string)[] = [];

  // Top rule
  elements.push(
    Text(lavHeader(figures.horizontalLine.repeat(dividerWidth)), { overflow: 'hidden' }),
  );

  // Header Title Row
  if (options.subtitle) {
    elements.push(
      Box({ direction: 'row', justify: 'space-between', width: maxCols }, [
        Text(options.title, { color: theme.info }),
        Text(options.subtitle, { dim: true }),
      ]),
    );
  } else {
    elements.push(Text(options.title, { color: theme.lavenderLight }));
  }

  // Search Query input
  if (options.queryInput) {
    const pointer = infoColor(`${figures.pointer} `);
    const queryDisplay = options.queryInput.query
      ? chalk.white(options.queryInput.query)
      : chalk.dim(options.queryInput.placeholder);
    elements.push(Text(`${pointer}${queryDisplay}`));
    elements.push(
      Text(dashRule(figures.horizontalLine.repeat(dividerWidth)), { overflow: 'hidden' }),
    );
  }

  // Content children
  for (const child of options.content) {
    elements.push(child);
  }

  // Footer
  if (options.footer) {
    elements.push(Text(chalk.dim.italic(options.footer)));
  }

  const modalBox = Box({ direction: 'column', width: maxCols, overflow: 'hidden' }, elements);
  return modalBox.render(maxCols);
}

export function renderKeyHints(hints: Array<{ key: string; label: string }>): string {
  return chalk.dim.italic(hints.map((h) => `${h.key} ${h.label}`).join(' · '));
}
