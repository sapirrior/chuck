import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import chalk from 'chalk';
import { themeColor, themeBgColor, truncateToWidth } from '../utils/format.js';
import { wrapVisualLine } from '../engine/cell-layout.js';

export interface TextProps {
  // Styling
  color?: string | ((str: string) => string);
  bgColor?: string | ((str: string) => string);
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;

  // Layout & Alignment
  align?: 'left' | 'center' | 'right';
  overflow?: 'wrap' | 'hidden' | 'visible';
  truncation?: 'clip' | 'ellipsis' | 'none';
  maxWidth?: number;
}

export class TextElement {
  constructor(
    public content: string,
    public props: TextProps = {},
  ) {}

  render(availableWidth: number): string[] {
    const rawContent = this.content ?? '';
    const maxW = this.props.maxWidth
      ? Math.min(availableWidth, this.props.maxWidth)
      : availableWidth;
    const effWidth = Math.max(1, maxW);

    // Apply text styling
    let styled = rawContent;
    if (this.props.bold) styled = chalk.bold(styled);
    if (this.props.dim) styled = chalk.dim(styled);
    if (this.props.italic) styled = chalk.italic(styled);
    if (this.props.underline) styled = chalk.underline(styled);
    if (this.props.strikethrough) styled = chalk.strikethrough(styled);

    if (this.props.color) {
      if (typeof this.props.color === 'function') {
        styled = this.props.color(styled);
      } else {
        styled = themeColor(this.props.color)(styled);
      }
    }

    if (this.props.bgColor) {
      if (typeof this.props.bgColor === 'function') {
        styled = this.props.bgColor(styled);
      } else {
        styled = themeBgColor(this.props.bgColor)(styled);
      }
    }

    const overflow = this.props.overflow ?? 'wrap';
    const truncation = this.props.truncation ?? (overflow === 'hidden' ? 'clip' : 'none');

    let lines: string[];
    if (overflow === 'wrap') {
      const vLines = styled.split('\n');
      lines = vLines.flatMap((vl) => (vl ? wrapVisualLine(vl, effWidth) : ['']));
    } else {
      const vLines = styled.split('\n');
      if (truncation === 'clip' || truncation === 'ellipsis') {
        lines = vLines.map((vl) => truncateToWidth(vl, effWidth));
      } else {
        lines = vLines;
      }
    }

    // Apply horizontal alignment
    if (this.props.align && this.props.align !== 'left') {
      lines = lines.map((line) => {
        const visWidth = stringWidth(stripAnsi(line));
        const rem = Math.max(0, effWidth - visWidth);
        if (rem === 0) return line;

        if (this.props.align === 'right') {
          return ' '.repeat(rem) + line;
        }
        if (this.props.align === 'center') {
          const left = Math.floor(rem / 2);
          const right = rem - left;
          return ' '.repeat(left) + line + ' '.repeat(right);
        }
        return line;
      });
    }

    return lines;
  }
}

export function Text(content: string, props?: TextProps): TextElement {
  return new TextElement(content, props);
}
