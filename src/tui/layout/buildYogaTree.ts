import Yoga, {
  FlexDirection,
  Justify,
  Align,
  PositionType,
  Overflow,
  Edge,
  Gutter,
  type Node as YogaNode,
} from './yoga.js';
import type { LayoutNode, BoxNode, TextNodeLayout } from './LayoutNode.js';
import { wrapVisualLine } from '../engine/cell-layout.js';
import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';

export interface YogaTreeNode {
  yogaNode: YogaNode;
  layoutNode: LayoutNode;
  children: YogaTreeNode[];
}

export function buildYogaTree(node: LayoutNode): YogaTreeNode {
  const yogaNode = Yoga.Node.create();

  if (node.type === 'text') {
    const textNode = node;
    yogaNode.setMeasureFunc((width, widthMode, height, heightMode) => {
      if (!textNode.content) {
        return { width: 0, height: 0 };
      }

      const availableWidth =
        width !== undefined && Number.isFinite(width) && width > 0 ? Math.floor(width) : 1000;

      const lines =
        textNode.wrappable !== false
          ? wrapVisualLine(textNode.content, availableWidth)
          : textNode.content.split('\n');

      let maxW = 0;
      for (const line of lines) {
        const w = stringWidth(stripAnsi(line));
        if (w > maxW) maxW = w;
      }

      return {
        width: Math.min(availableWidth, maxW),
        height: Math.max(1, lines.length),
      };
    });

    if (textNode.flexGrow !== undefined) yogaNode.setFlexGrow(textNode.flexGrow);
    if (textNode.flexShrink !== undefined) yogaNode.setFlexShrink(textNode.flexShrink);
    if (textNode.alignSelf !== undefined) yogaNode.setAlignSelf(textNode.alignSelf);

    return {
      yogaNode,
      layoutNode: node,
      children: [],
    };
  }

  // BoxNode
  const boxNode = node;

  // Flex Direction
  if (boxNode.direction === 'row') {
    yogaNode.setFlexDirection(FlexDirection.Row);
  } else if (boxNode.direction === 'row-reverse') {
    yogaNode.setFlexDirection(FlexDirection.RowReverse);
  } else if (boxNode.direction === 'column-reverse') {
    yogaNode.setFlexDirection(FlexDirection.ColumnReverse);
  } else {
    yogaNode.setFlexDirection(FlexDirection.Column);
  }

  // Dimensions
  if (boxNode.width !== undefined) {
    if (boxNode.width === 'auto') {
      yogaNode.setWidthAuto();
    } else if (typeof boxNode.width === 'string' && boxNode.width.endsWith('%')) {
      yogaNode.setWidthPercent(parseFloat(boxNode.width));
    } else if (typeof boxNode.width === 'number') {
      yogaNode.setWidth(boxNode.width);
    }
  }

  if (boxNode.height !== undefined) {
    if (boxNode.height === 'auto') {
      yogaNode.setHeightAuto();
    } else if (typeof boxNode.height === 'string' && boxNode.height.endsWith('%')) {
      yogaNode.setHeightPercent(parseFloat(boxNode.height));
    } else if (typeof boxNode.height === 'number') {
      yogaNode.setHeight(boxNode.height);
    }
  }

  if (boxNode.minWidth !== undefined) yogaNode.setMinWidth(boxNode.minWidth);
  if (boxNode.maxWidth !== undefined) yogaNode.setMaxWidth(boxNode.maxWidth);
  if (boxNode.minHeight !== undefined) yogaNode.setMinHeight(boxNode.minHeight);
  if (boxNode.maxHeight !== undefined) yogaNode.setMaxHeight(boxNode.maxHeight);

  // Padding
  if (boxNode.padding !== undefined) yogaNode.setPadding(Edge.All, boxNode.padding);
  if (boxNode.paddingTop !== undefined) yogaNode.setPadding(Edge.Top, boxNode.paddingTop);
  if (boxNode.paddingBottom !== undefined) yogaNode.setPadding(Edge.Bottom, boxNode.paddingBottom);
  if (boxNode.paddingLeft !== undefined) yogaNode.setPadding(Edge.Left, boxNode.paddingLeft);
  if (boxNode.paddingRight !== undefined) yogaNode.setPadding(Edge.Right, boxNode.paddingRight);

  // Margin
  if (boxNode.margin !== undefined) yogaNode.setMargin(Edge.All, boxNode.margin);
  if (boxNode.marginTop !== undefined) yogaNode.setMargin(Edge.Top, boxNode.marginTop);
  if (boxNode.marginBottom !== undefined) yogaNode.setMargin(Edge.Bottom, boxNode.marginBottom);
  if (boxNode.marginLeft !== undefined) yogaNode.setMargin(Edge.Left, boxNode.marginLeft);
  if (boxNode.marginRight !== undefined) yogaNode.setMargin(Edge.Right, boxNode.marginRight);

  // Gap
  if (boxNode.gap !== undefined) {
    yogaNode.setGap(Gutter.All, boxNode.gap);
  }

  // Flex properties
  if (boxNode.flexGrow !== undefined) yogaNode.setFlexGrow(boxNode.flexGrow);
  if (boxNode.flexShrink !== undefined) yogaNode.setFlexShrink(boxNode.flexShrink);
  if (boxNode.justify !== undefined) yogaNode.setJustifyContent(boxNode.justify);
  if (boxNode.align !== undefined) yogaNode.setAlignItems(boxNode.align);
  if (boxNode.alignSelf !== undefined) yogaNode.setAlignSelf(boxNode.alignSelf);

  // Position
  if (boxNode.position === 'absolute') {
    yogaNode.setPositionType(PositionType.Absolute);
  } else {
    yogaNode.setPositionType(PositionType.Relative);
  }

  if (boxNode.top !== undefined) yogaNode.setPosition(Edge.Top, boxNode.top);
  if (boxNode.bottom !== undefined) yogaNode.setPosition(Edge.Bottom, boxNode.bottom);
  if (boxNode.left !== undefined) yogaNode.setPosition(Edge.Left, boxNode.left);
  if (boxNode.right !== undefined) yogaNode.setPosition(Edge.Right, boxNode.right);

  // Overflow
  if (boxNode.overflow === 'hidden') {
    yogaNode.setOverflow(Overflow.Hidden);
  } else {
    yogaNode.setOverflow(Overflow.Visible);
  }

  const children: YogaTreeNode[] = [];
  for (let i = 0; i < boxNode.children.length; i++) {
    const childLayoutNode = boxNode.children[i]!;
    const childTree = buildYogaTree(childLayoutNode);
    yogaNode.insertChild(childTree.yogaNode, i);
    children.push(childTree);
  }

  return {
    yogaNode,
    layoutNode: node,
    children,
  };
}
