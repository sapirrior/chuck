import { homedir } from 'node:os';
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

  private formatCwd(rawPath?: string): string {
    if (!rawPath) return '~';
    const home = homedir();
    if (rawPath.startsWith(home)) {
      return `~${rawPath.slice(home.length)}`;
    }
    return rawPath;
  }

  override render(_width?: number): string[] {
    const theme = getTheme();
    const version = this.props.version ?? '0.1.4';
    const brandColor = themeColor(theme.brand);
    const logoL0 = brandColor(LOGO_LINES[0] ?? '');
    const logoL1 = brandColor(LOGO_LINES[1] ?? '');
    const logoL2 = brandColor(LOGO_LINES[2] ?? '');

    const modelObj = this.props.model ?? { provider: 'anthropic', modelId: 'claude-3-7-sonnet' };
    const modelTag = `${modelObj.provider}/${modelObj.modelId}`;
    const cwdFormatted = this.formatCwd(this.props.cwd ?? process.cwd());

    return Box({ direction: 'column', overflow: 'visible', truncation: 'none' }, [
      Text(`${logoL0}  ${chalk.white.bold('Chuck')} ${chalk.dim(`v${version}`)}`, {
        overflow: 'visible',
        truncation: 'none',
      }),
      Text(
        `${logoL1}  ${chalk.dim(modelTag)} ${chalk.dim('·')} ${chalk.dim('API Usage Billing')}`,
        {
          overflow: 'visible',
          truncation: 'none',
        },
      ),
      Text(`${logoL2}  ${chalk.dim(cwdFormatted)}`, {
        overflow: 'visible',
        truncation: 'none',
      }),
      Text('', { overflow: 'visible', truncation: 'none' }),
    ]).render(80);
  }
}
