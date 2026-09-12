import Component from '../../engine/Component.js';
import type { SlashCommand } from '../../../commands/types.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk } from '../../utils/format.js';
import { Box, Text } from '../../primitives/index.js';

export interface CommandPaletteProps {
  commands: SlashCommand[];
  selectedIndex: number;
}

export default class CommandPalette extends Component<CommandPaletteProps> {
  override overflow = 'hidden' as const;
  override truncation = 'clip' as const;

  override render(width?: number): string[] {
    const { commands, selectedIndex } = this.props;
    if (commands.length === 0) return [];

    const theme = getTheme();
    const infoColor = themeColor(theme.info);
    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(1, termWidth - 1);

    const rows = commands.map((cmd, i) => {
      const isSelected = i === selectedIndex;
      const pointer = isSelected ? `${figures.pointer} ` : '  ';
      const name = `/${cmd.name}`.padEnd(16);

      return Box({ direction: 'row', gap: 1, width: maxCols }, [
        Text(`${pointer}${name}`, { color: isSelected ? infoColor : chalk.dim }),
        Text(cmd.description, { color: isSelected ? 'white' : chalk.dim, overflow: 'hidden' }),
      ]);
    });

    const paletteBox = Box({ direction: 'column', width: maxCols, overflow: 'hidden' }, [
      Text('Commands', { color: theme.info }),
      ...rows,
      Text('Enter to select · Esc to dismiss · ↑/↓ to navigate', { dim: true, italic: true }),
    ]);

    return paletteBox.render(maxCols);
  }
}
