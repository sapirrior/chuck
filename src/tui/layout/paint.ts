import type { YogaTreeNode } from './buildYogaTree.js';
import type { ScreenBuffer } from './ScreenBuffer.js';
import { wrapVisualLine } from '../engine/cell-layout.js';

export function paintTree(
  treeNode: YogaTreeNode,
  buffer: ScreenBuffer,
  parentX = 0,
  parentY = 0,
): void {
  const left = treeNode.yogaNode.getComputedLeft();
  const top = treeNode.yogaNode.getComputedTop();
  const width = treeNode.yogaNode.getComputedWidth();
  const height = treeNode.yogaNode.getComputedHeight();

  const currentX = parentX + left;
  const currentY = parentY + top;

  if (treeNode.layoutNode.type === 'text') {
    const textNode = treeNode.layoutNode;
    if (!textNode.content) return;

    const availableWidth = Math.max(1, Math.floor(width));
    const lines =
      textNode.wrappable !== false
        ? wrapVisualLine(textNode.content, availableWidth)
        : textNode.content.split('\n');

    const maxLines = Math.max(1, Math.floor(height));
    for (let i = 0; i < lines.length && i < maxLines; i++) {
      const line = lines[i] ?? '';
      buffer.blitText(Math.round(currentX), Math.round(currentY) + i, availableWidth, line);
    }
    return;
  }

  // BoxNode: paint children
  for (const child of treeNode.children) {
    paintTree(child, buffer, currentX, currentY);
  }
}
