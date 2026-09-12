import Component from '../../engine/Component.js';
import { getTheme, figures } from '../../../theme/index.js';
import { themeColor, chalk } from '../../utils/format.js';

export interface FileMatchesProps {
  files: string[];
  selectedIndex: number;
}

export default class FileMatches extends Component<FileMatchesProps> {
  override overflow = 'hidden' as const;
  override truncation = 'clip' as const;

  override render(): string[] {
    const { files, selectedIndex } = this.props;
    if (files.length === 0) return [];

    const theme = getTheme();
    const infoColor = themeColor(theme.info);
    const lines: string[] = [chalk.dim('Matching files (@):')];

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const isSelected = i === selectedIndex;
      const pointer = isSelected ? infoColor(`${figures.pointer} `) : '  ';
      const fileText = isSelected ? infoColor(file) : chalk.dim(file);
      lines.push(`${pointer}${fileText}`);
    }

    return lines;
  }
}
