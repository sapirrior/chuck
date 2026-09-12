import { describe, it, expect } from 'bun:test';
import { DocumentTree, TextNode } from '../../src/tui/engine/DocumentTree.js';
import { layoutDocument, type ComponentNode } from '../../src/tui/engine/cell-layout.js';

describe('Phase 4: High-Performance Scrollback Cache', () => {
  it('measures layoutDocument with 2,000 history entries in sub-millisecond on live interactive updates', () => {
    const tree = new DocumentTree();
    const width = 80;

    // Populate 2,000 history entries
    for (let i = 0; i < 2000; i++) {
      tree.addText([
        `Message #${i}: The quick brown fox jumps over the lazy dog and tests wrapping behavior under load.`,
        `Extra detail line for item ${i} containing metadata and status info.`,
      ]);
    }

    // Mount an interactive live node
    let liveInputText = 'hello world';
    const liveNode: ComponentNode = {
      id: 'live-prompt',
      kind: 'input',
      getLines: () => [`> ${liveInputText}`],
      getLogicalCursor: () => ({
        logicalLineIndex: 0,
        characterOffsetWithinLine: 2 + liveInputText.length,
      }),
    };
    tree.mountNode(liveNode);

    // Warm up the history cache at width 80
    const initialResult = layoutDocument(tree, width);
    expect(initialResult.physicalRows.length).toBeGreaterThan(4000);
    expect(initialResult.cursor).not.toBeNull();
    expect(initialResult.cursor?.row).toBe(initialResult.physicalRows.length - 1);
    expect(initialResult.cursor?.column).toBe(2 + liveInputText.length + 1);

    // Benchmark 100 keystroke updates on live node
    const iterations = 100;
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      liveInputText = `query iteration ${i}`;
      const result = layoutDocument(tree, width);
      expect(result.physicalRows.length).toBe(initialResult.physicalRows.length);
    }

    const elapsedMs = performance.now() - startTime;
    const avgMsPerFrame = elapsedMs / iterations;

    // Must be well under 1ms per frame (typically < 0.1ms)
    expect(avgMsPerFrame).toBeLessThan(1.0);
  });

  it('correctly recalculates cached history on resize / invalidateCache', () => {
    const tree = new DocumentTree();

    tree.addText([
      'Line 1: A very long string that wraps across multiple lines depending on the terminal width setting.',
      'Line 2: Short line.',
    ]);

    const result80 = layoutDocument(tree, 80);
    const count80 = result80.physicalRows.length;

    // Narrow width forces more wrapped lines
    const result30 = layoutDocument(tree, 30);
    const count30 = result30.physicalRows.length;

    expect(count30).toBeGreaterThan(count80);

    // Invalidate and verify recomputation at 80
    tree.invalidateCache();
    const result80Again = layoutDocument(tree, 80);
    expect(result80Again.physicalRows.length).toBe(count80);
  });

  it('clears history correctly', () => {
    const tree = new DocumentTree();
    tree.addText(['Line 1', 'Line 2']);
    expect(layoutDocument(tree, 80).physicalRows.length).toBe(2);

    tree.clearHistory();
    expect(layoutDocument(tree, 80).physicalRows.length).toBe(0);
  });
});
