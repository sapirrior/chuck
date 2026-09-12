import Component from '../../engine/Component.js';
import type { SlashCommand } from '../../../commands/types.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk, stripAnsi, truncateToWidth } from '../../utils/format.js';
import stringWidth from 'string-width';

export interface CommandPaletteProps {
  commands: SlashCommand[];
  selectedIndex: number;
}

export default class CommandPalette extends Component<CommandPaletteProps> {
  override render(width?: number): string[] {
    const { commands, selectedIndex } = this.props;
    if (commands.length === 0) return [];

    const theme = getTheme();
    const infoColor = themeColor(theme.info);
    const termWidth = width ?? process.stdout.columns ?? 80;
    const maxCols = Math.max(0, termWidth - 1);

    const lines: string[] = [truncateToWidth(infoColor('Commands'), maxCols)];

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]!;
      const isSelected = i === selectedIndex;
      const pointer = isSelected ? infoColor(`${figures.pointer} `) : '  ';
      const nameRaw = `/${cmd.name}`.padEnd(16);
      const name = isSelected ? infoColor(nameRaw) : chalk.dim(nameRaw);
      const prefixWidth = stringWidth(stripAnsi(pointer)) + stringWidth(stripAnsi(name));
      const maxDescWidth = Math.max(0, maxCols - prefixWidth);
      const descText = truncateToWidth(cmd.description, maxDescWidth);
      const desc = isSelected ? chalk.white(descText) : chalk.dim(descText);
      const row = `${pointer}${name}${desc}`;
      lines.push(truncateToWidth(row, maxCols));
    }

    lines.push(
      truncateToWidth(
        chalk.dim.italic('Enter to select · Esc to dismiss · ↑/↓ to navigate'),
        maxCols,
      ),
    );
    return lines;
  }
}
