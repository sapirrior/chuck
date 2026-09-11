import Component from '../engine/Component.js';
import { getTheme, LOGO_LINES } from '../../theme/index.js';
import { themeColor, chalk } from '../utils/format.js';

export interface HeaderProps {
  version?: string;
  cwd?: string;
  model?: {
    provider: string;
    modelId: string;
  };
}

export default class Header extends Component<HeaderProps> {
  override render(): string[] {
    const theme = getTheme();
    const version = this.props.version ?? '0.1.0';
    const brandColor = themeColor(theme.brand);
    const permColor = themeColor(theme.permission);

    const logoL0 = brandColor(LOGO_LINES[0] ?? '');
    const logoL1 = brandColor(LOGO_LINES[1] ?? '');
    const logoL2 = brandColor(LOGO_LINES[2] ?? '');

    const line0 = `${logoL0}  ${brandColor.bold('xd')} ${permColor(`v${version}`)}`;
    const line1 = `${logoL1}  ${chalk.dim('Type ')}${brandColor('/')}${chalk.dim(' for commands')}`;
    const line2 = `${logoL2}`;

    return [line0, line1, line2, ''];
  }
}
