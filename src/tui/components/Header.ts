import Component from '../engine/Component.js';
import { getTheme, LOGO_LINES } from '../../theme/index.js';
import { themeColor, chalk } from '../utils/format.js';
import { Box, Text } from '../primitives/index.js';

export interface HeaderProps {
  version?: string;
  cwd?: string;
  model?: {
    provider: string;
    modelId: string;
  };
}

export default class Header extends Component<HeaderProps> {
  override overflow = 'visible' as const;
  override truncation = 'none' as const;

  override render(_width?: number): string[] {
    const theme = getTheme();
    const version = this.props.version ?? '0.1.0';
    const brandColor = themeColor(theme.brand);
    const permColor = themeColor(theme.permission);

    const logoL0 = brandColor(LOGO_LINES[0] ?? '');
    const logoL1 = brandColor(LOGO_LINES[1] ?? '');
    const logoL2 = brandColor(LOGO_LINES[2] ?? '');

    return Box({ direction: 'column', overflow: 'visible', truncation: 'none' }, [
      Text(`${logoL0}  ${chalk.white.bold('xd')} ${permColor(`v${version}`)}`, {
        overflow: 'visible',
        truncation: 'none',
      }),
      Text(`${logoL1}  ${chalk.dim('AI can make mistakes. Verify important info.')}`, {
        overflow: 'visible',
        truncation: 'none',
      }),
      Text(logoL2, { overflow: 'visible', truncation: 'none' }),
      Text('', { overflow: 'visible', truncation: 'none' }),
    ]).render(80);
  }
}
