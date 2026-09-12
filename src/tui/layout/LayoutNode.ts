import type { Justify, Align } from './yoga.js';

export interface BoxNode {
  type: 'box';
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  children: LayoutNode[];
  width?: number | 'auto' | `${number}%`;
  height?: number | 'auto' | `${number}%`;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  padding?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  margin?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  gap?: number;
  flexGrow?: number;
  flexShrink?: number;
  justify?: Justify;
  align?: Align;
  alignSelf?: Align;
  position?: 'relative' | 'absolute';
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  overflow?: 'visible' | 'hidden';
}

export interface TextNodeLayout {
  type: 'text';
  content: string;
  wrappable?: boolean;
  maxWidth?: number;
  flexGrow?: number;
  flexShrink?: number;
  alignSelf?: Align;
}

export type LayoutNode = BoxNode | TextNodeLayout;

export function box(
  props: Omit<BoxNode, 'type' | 'children'> = {},
  ...children: (LayoutNode | string | undefined | null | false)[]
): BoxNode {
  const flatChildren: LayoutNode[] = [];
  for (const c of children) {
    if (c === undefined || c === null || c === false) continue;
    if (typeof c === 'string') {
      flatChildren.push({ type: 'text', content: c });
    } else {
      flatChildren.push(c);
    }
  }
  return {
    type: 'box',
    ...props,
    children: flatChildren,
  };
}

export function text(
  content: string,
  props: Partial<Omit<TextNodeLayout, 'type' | 'content'>> = {},
): TextNodeLayout {
  return {
    type: 'text',
    content,
    ...props,
  };
}
