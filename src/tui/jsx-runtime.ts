import { Box, BoxElement, type BoxProps, type BoxChild } from './primitives/Box.js';
import { Text, TextElement, type TextProps } from './primitives/Text.js';
import Component from './engine/Component.js';

export const Fragment = Symbol.for('steward.fragment');

function flattenChildren(children: any): BoxChild[] {
  if (children === null || children === undefined || children === false) {
    return [];
  }
  if (Array.isArray(children)) {
    return children.flatMap(flattenChildren);
  }
  return [children];
}

export function jsx(type: any, props: any = {}, _key?: any): any {
  if (type === Fragment) {
    return flattenChildren(props?.children);
  }

  const { children, ...rest } = props || {};

  if (type === 'box' || type === Box) {
    const flatChildren = flattenChildren(children);
    return Box(rest as BoxProps, flatChildren);
  }

  if (type === 'text' || type === Text) {
    const flatChildren = flattenChildren(children);
    const content = flatChildren
      .map((c) => (typeof c === 'string' ? c : c instanceof TextElement ? c.content : ''))
      .join('');
    return Text(content, rest as TextProps);
  }

  if (typeof type === 'function') {
    // Class component
    if (type.prototype && (type.prototype instanceof Component || 'render' in type.prototype)) {
      return new type(props);
    }
    // Function component
    return type(props);
  }

  return null;
}

export const jsxs = jsx;
export const jsxDEV = jsx;

export namespace JSX {
  export type Element = BoxElement | TextElement | Component<any, any> | any;
  export interface ElementClass extends Component<any, any> {}
  export interface IntrinsicElements {
    box: BoxProps & { children?: any };
    text: TextProps & { children?: any };
  }
}
