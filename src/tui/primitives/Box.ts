import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import { themeColor, truncateToWidth } from '../utils/format.js';
import { figures } from '../../theme/index.js';
import { TextElement, type TextProps } from './Text.js';

export type BorderStyle = 'none' | 'single' | 'dashed' | 'double' | 'rounded' | 'top-bottom';

export interface BoxProps {
  direction?: 'row' | 'column';
  width?: number | '100%';
  height?: number;
  gap?: number;
  justify?: 'start' | 'center' | 'end' | 'space-between';
  align?: 'start' | 'center' | 'end';

  border?: BorderStyle;
  borderColor?: string | ((str: string) => string);
  padding?: number | [number, number];
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;

  wrap?: boolean;
  clip?: boolean;
  ellipsis?: boolean;
}

export type BoxChild = BoxElement | TextElement | string | null | undefined;

export class BoxElement {
  constructor(
    public props: BoxProps = {},
    public children: BoxChild[] = [],
  ) {}

  render(availableWidth: number): string[] {
    const termWidth =
      typeof this.props.width === 'number'
        ? this.props.width
        : availableWidth || process.stdout.columns || 80;

    const maxCols = Math.max(1, termWidth);
    const border = this.props.border ?? 'none';
    const hasSideBorders =
      border === 'single' || border === 'dashed' || border === 'double' || border === 'rounded';
    const borderHorizInset = hasSideBorders ? 2 : 0;

    // Resolve padding
    let padTop = this.props.paddingTop ?? 0;
    let padBottom = this.props.paddingBottom ?? 0;
    let padLeft = this.props.paddingLeft ?? 0;
    let padRight = this.props.paddingRight ?? 0;

    if (this.props.padding !== undefined) {
      if (typeof this.props.padding === 'number') {
        padTop = padBottom = padLeft = padRight = this.props.padding;
      } else if (Array.isArray(this.props.padding)) {
        padTop = padBottom = this.props.padding[0] ?? 0;
        padLeft = padRight = this.props.padding[1] ?? 0;
      }
    }

    const innerWidth = Math.max(1, maxCols - borderHorizInset - padLeft - padRight);
    const validChildren = this.children.filter(
      (c): c is BoxElement | TextElement | string => c !== null && c !== undefined,
    );

    let contentLines: string[] = [];

    if (this.props.direction === 'row') {
      contentLines = this.renderRow(validChildren, innerWidth);
    } else {
      contentLines = this.renderColumn(validChildren, innerWidth);
    }

    // Apply horizontal padding to content lines
    if (padLeft > 0 || padRight > 0) {
      const leftPadStr = ' '.repeat(padLeft);
      const rightPadStr = ' '.repeat(padRight);
      contentLines = contentLines.map((l) => `${leftPadStr}${l}${rightPadStr}`);
    }

    // Apply vertical padding
    if (padTop > 0) {
      const emptyRow = ' '.repeat(innerWidth + padLeft + padRight);
      for (let i = 0; i < padTop; i++) {
        contentLines.unshift(emptyRow);
      }
    }
    if (padBottom > 0) {
      const emptyRow = ' '.repeat(innerWidth + padLeft + padRight);
      for (let i = 0; i < padBottom; i++) {
        contentLines.push(emptyRow);
      }
    }

    // Apply borders
    const finalLines = this.applyBorders(contentLines, maxCols, border);

    const isClipped = this.props.clip ?? false;
    if (isClipped) {
      return finalLines.map((l) => truncateToWidth(l, maxCols));
    }
    return finalLines;
  }

  private renderColumn(
    children: (BoxElement | TextElement | string)[],
    innerWidth: number,
  ): string[] {
    const lines: string[] = [];
    const gap = this.props.gap ?? 0;

    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      let childLines: string[];

      if (typeof child === 'string') {
        childLines = new TextElement(child).render(innerWidth);
      } else {
        childLines = child.render(innerWidth);
      }

      for (const cl of childLines) {
        lines.push(cl);
      }

      if (gap > 0 && i < children.length - 1) {
        for (let g = 0; g < gap; g++) {
          lines.push('');
        }
      }
    }

    return lines;
  }

  private renderRow(children: (BoxElement | TextElement | string)[], innerWidth: number): string[] {
    if (children.length === 0) return [];
    const justify = this.props.justify ?? 'start';
    const gap = this.props.gap ?? (justify === 'space-between' ? 1 : 0);

    // Render single-line representations of each child
    const renderedUnits: { text: string; width: number }[] = [];
    for (const child of children) {
      const cLines =
        typeof child === 'string'
          ? new TextElement(child).render(innerWidth)
          : child.render(innerWidth);
      const firstLine = cLines[0] ?? '';
      renderedUnits.push({
        text: firstLine,
        width: stringWidth(stripAnsi(firstLine)),
      });
    }

    if (renderedUnits.length === 1) {
      const unit = renderedUnits[0]!;
      if (justify === 'end') {
        const pad = Math.max(0, innerWidth - unit.width);
        return [' '.repeat(pad) + unit.text];
      }
      if (justify === 'center') {
        const pad = Math.max(0, innerWidth - unit.width);
        const left = Math.floor(pad / 2);
        return [' '.repeat(left) + unit.text];
      }
      return [unit.text];
    }

    if (justify === 'space-between') {
      const totalContentWidth = renderedUnits.reduce((acc, u) => acc + u.width, 0);
      const gapsCount = renderedUnits.length - 1;
      const totalAvailableGap = Math.max(gapsCount, innerWidth - totalContentWidth);
      const baseGap = Math.floor(totalAvailableGap / gapsCount);
      const remainder = totalAvailableGap % gapsCount;

      let row = '';
      for (let i = 0; i < renderedUnits.length; i++) {
        row += renderedUnits[i]!.text;
        if (i < gapsCount) {
          const currentGap = baseGap + (i < remainder ? 1 : 0);
          row += ' '.repeat(Math.max(1, currentGap));
        }
      }
      return [row];
    }

    // Default start or gap distribution
    const gapStr = ' '.repeat(gap);
    const row = renderedUnits.map((u) => u.text).join(gapStr);

    if (justify === 'end') {
      const visWidth = stringWidth(stripAnsi(row));
      const pad = Math.max(0, innerWidth - visWidth);
      return [' '.repeat(pad) + row];
    }

    return [row];
  }

  private applyBorders(lines: string[], totalWidth: number, border: BorderStyle): string[] {
    if (border === 'none') return lines;

    const colorFn =
      typeof this.props.borderColor === 'function'
        ? this.props.borderColor
        : this.props.borderColor
          ? themeColor(this.props.borderColor)
          : (s: string) => s;

    if (border === 'top-bottom') {
      const rule = colorFn(figures.horizontalLine.repeat(totalWidth));
      return [rule, ...lines, rule];
    }

    // Box borders
    const horizChar = border === 'dashed' ? '┄' : border === 'double' ? '═' : '─';
    const vertChar = border === 'dashed' ? '┊' : border === 'double' ? '║' : '│';
    const topLeft =
      border === 'rounded'
        ? '╭'
        : border === 'dashed'
          ? '┌'
          : border === 'double'
            ? '╔'
            : figures.boxTopLeft;
    const topRight =
      border === 'rounded'
        ? '╮'
        : border === 'dashed'
          ? '┐'
          : border === 'double'
            ? '╗'
            : figures.boxTopRight;
    const bottomLeft =
      border === 'rounded'
        ? '╰'
        : border === 'dashed'
          ? '└'
          : border === 'double'
            ? '╚'
            : figures.boxBottomLeft;
    const bottomRight =
      border === 'rounded'
        ? '╯'
        : border === 'dashed'
          ? '┘'
          : border === 'double'
            ? '╝'
            : figures.boxBottomRight;

    const innerSpan = Math.max(0, totalWidth - 2);
    const topBar = colorFn(`${topLeft}${horizChar.repeat(innerSpan)}${topRight}`);
    const bottomBar = colorFn(`${bottomLeft}${horizChar.repeat(innerSpan)}${bottomRight}`);

    const boxedLines = lines.map((l) => {
      const visWidth = stringWidth(stripAnsi(l));
      const padRight = Math.max(0, innerSpan - visWidth);
      return `${colorFn(vertChar)}${l}${' '.repeat(padRight)}${colorFn(vertChar)}`;
    });

    return [topBar, ...boxedLines, bottomBar];
  }
}

export function Box(
  props: BoxProps,
  children?: (BoxElement | TextElement | string | null | undefined)[],
): BoxElement {
  return new BoxElement(props, children ?? []);
}
