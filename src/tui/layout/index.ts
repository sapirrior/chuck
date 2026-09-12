import { buildYogaTree } from './buildYogaTree.js';
import { paintTree } from './paint.js';
import { ScreenBuffer } from './ScreenBuffer.js';
import type { LayoutNode } from './LayoutNode.js';

export * from './yoga.js';
export * from './LayoutNode.js';
export * from './buildYogaTree.js';
export * from './ScreenBuffer.js';
export * from './paint.js';

export function layoutAndPaint(
  rootNode: LayoutNode,
  width: number,
  height?: number,
): { buffer: ScreenBuffer; computedWidth: number; computedHeight: number } {
  const tree = buildYogaTree(rootNode);
  tree.yogaNode.calculateLayout(width, height);

  const computedWidth = Math.ceil(tree.yogaNode.getComputedWidth()) || width;
  const computedHeight = Math.ceil(tree.yogaNode.getComputedHeight()) || (height ?? 1);

  const finalHeight = height ?? computedHeight;
  const buffer = new ScreenBuffer(computedWidth, finalHeight);

  paintTree(tree, buffer, 0, 0);

  return { buffer, computedWidth, computedHeight: finalHeight };
}

export function renderLayoutToLines(
  rootNode: LayoutNode,
  width: number,
  height?: number,
): string[] {
  const { buffer, computedHeight } = layoutAndPaint(rootNode, width, height);
  const lines: string[] = [];
  for (let y = 0; y < computedHeight; y++) {
    lines.push(buffer.getRow(y));
  }
  return lines;
}
