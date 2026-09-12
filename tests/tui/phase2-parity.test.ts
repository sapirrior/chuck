import { describe, it, expect } from 'bun:test';
import { DocumentTree } from '../../src/tui/engine/DocumentTree.js';
import StateRenderer from '../../src/tui/engine/StateRenderer.js';
import { ScreenBuffer } from '../../src/tui/layout/ScreenBuffer.js';

describe('Phase 2: ScreenBuffer StateRenderer Integration and Parity', () => {
  it('renders a full frame and produces valid ANSI output without error', () => {
    const tree = new DocumentTree();
    tree.addText(['Welcome to xd', 'Line 2 of document'], true);
    tree.addUserMessage('Hello world user prompt', false);

    const renderer = new StateRenderer();
    const frame = renderer.render(tree, 0, true);

    expect(frame.lines.length).toBeGreaterThan(0);
    expect(frame.lines[0]).toContain('Welcome to xd');
  });

  it('correctly reports differences across incremental frames', () => {
    const bufA = new ScreenBuffer(40, 5);
    bufA.blitText(0, 0, 40, 'Static Header');
    bufA.blitText(0, 1, 40, 'Row A');
    bufA.blitText(0, 2, 40, 'Status: Idle');

    const bufB = new ScreenBuffer(40, 5);
    bufB.blitText(0, 0, 40, 'Static Header');
    bufB.blitText(0, 1, 40, 'Row B');
    bufB.blitText(0, 2, 40, 'Status: Idle');

    const diffs = bufB.diff(bufA);
    expect(diffs).toEqual([{ row: 1, text: 'Row B' }]);
  });
});
