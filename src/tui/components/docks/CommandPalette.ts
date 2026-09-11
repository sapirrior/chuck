import Component from '../../engine/Component.js';
import type { SlashCommand } from '../../../commands/types.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk } from '../../utils/format.js';

export interface CommandPaletteProps {
  commands: SlashCommand[];
  selectedIndex: number;
}

export default class CommandPalette extends Component<CommandPaletteProps> {
  override render(): string[] {
    const { commands, selectedIndex } = this.props;
    if (commands.length === 0) return [];

    const theme = getTheme();
    const infoColor = themeColor(theme.info);
    const lines: string[] = [infoColor('Commands')];

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]!;
      const isSelected = i === selectedIndex;
      const pointer = isSelected ? infoColor(`${figures.pointer} `) : '  ';
      const name = isSelected
        ? infoColor(`/${cmd.name}`.padEnd(16))
        : chalk.dim(`/${cmd.name}`.padEnd(16));
      const desc = isSelected ? chalk.white(cmd.description) : chalk.dim(cmd.description);
      lines.push(`${pointer}${name}${desc}`);
    }

    lines.push(chalk.dim.italic('Enter to select · Esc to dismiss · ↑/↓ to navigate'));
    return lines;
  }
}
