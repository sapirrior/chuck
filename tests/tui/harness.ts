import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect } from 'bun:test';
import StateRenderer from '../../src/tui/engine/StateRenderer.js';
import type { DocumentTree } from '../../src/tui/engine/DocumentTree.js';
import type { DocumentFrame } from '../../src/tui/engine/FrameBuffer.js';

export interface HeadlessRenderResult {
  rawAnsi: string;
  frame: DocumentFrame;
  screenRows: string[];
}

export interface RenderOptions {
  cols?: number;
  rows?: number;
  scrollOffset?: number;
  forceFull?: boolean;
}

const GOLDENS_DIR = join(import.meta.dir, 'goldens');

/**
 * Runs a render callback while intercepting stdout and mocking dimensions.
 */
export function captureHeadlessRender(
  renderFn: (renderer: StateRenderer) => DocumentFrame,
  options: RenderOptions = {},
  existingRenderer?: StateRenderer,
): HeadlessRenderResult {
  const cols = options.cols ?? 80;
  const rows = options.rows ?? 24;

  const originalCols = process.stdout.columns;
  const originalRows = process.stdout.rows;
  const originalWrite = process.stdout.write;

  let captured = '';

  // Mock dimensions & intercept output
  (process.stdout as any).columns = cols;
  (process.stdout as any).rows = rows;
  (process.stdout as any).write = (chunk: any) => {
    captured += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    return true;
  };

  const renderer = existingRenderer ?? new StateRenderer();
  let frame: DocumentFrame;

  try {
    frame = renderFn(renderer);
  } finally {
    (process.stdout as any).columns = originalCols;
    (process.stdout as any).rows = originalRows;
    (process.stdout as any).write = originalWrite;
  }

  return {
    rawAnsi: captured,
    frame,
    screenRows: frame.lines,
  };
}

/**
 * Renders a DocumentTree headlessly and captures the ANSI output and frame.
 */
export function renderTreeHeadless(
  tree: DocumentTree,
  options: RenderOptions = {},
  existingRenderer?: StateRenderer,
): HeadlessRenderResult {
  return captureHeadlessRender(
    (renderer) => {
      return renderer.render(tree, options.scrollOffset ?? 0, options.forceFull ?? false);
    },
    options,
    existingRenderer,
  );
}

/**
 * Asserts the captured output matches the golden file on disk.
 * If UPDATE_GOLDENS=1 or golden file is missing, records it.
 */
export function assertGoldenMatch(goldenName: string, actualOutput: string): void {
  if (!existsSync(GOLDENS_DIR)) {
    mkdirSync(GOLDENS_DIR, { recursive: true });
  }

  const filePath = join(GOLDENS_DIR, `${goldenName}.txt`);
  const shouldUpdate = process.env.UPDATE_GOLDENS === '1' || !existsSync(filePath);

  if (shouldUpdate) {
    writeFileSync(filePath, actualOutput, 'utf-8');
  } else {
    const expected = readFileSync(filePath, 'utf-8');
    expect(actualOutput).toBe(expected);
  }
}
