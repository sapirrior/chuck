import { describe, expect, it } from 'bun:test';
import FilePermissionDock from '../../src/tui/components/docks/FilePermissionDock.js';
import TerminalEngine from '../../src/tui/engine/TerminalEngine.js';
import type { FilePermissionRequest } from '../../src/tools/types.js';

describe('FilePermissionDock Interaction & State Machine (Section 28)', () => {
  it('defaults to Yes selection, toggles with Up/Down and numeric keys 1/2, submits on Enter', () => {
    let decision: boolean | null = null;
    const request: FilePermissionRequest = {
      kind: 'create',
      filePath: 'src/hello.ts',
      before: null,
      after: 'console.log("hello");\n',
    };

    const dock = new FilePermissionDock({
      request,
      onDecision: (allowed) => {
        decision = allowed;
      },
    });

    const engine = new TerminalEngine();
    engine.mount(dock, { kind: 'dock' });

    expect(dock.state.selectedIndex).toBe(0); // Yes

    // Down arrow -> select No
    process.stdin.emit('data', Buffer.from('\x1b[B'));
    expect(dock.state.selectedIndex).toBe(1); // No

    // Up arrow -> select Yes
    process.stdin.emit('data', Buffer.from('\x1b[A'));
    expect(dock.state.selectedIndex).toBe(0); // Yes

    // Direct numeric 2 -> select No
    process.stdin.emit('data', Buffer.from('2'));
    expect(dock.state.selectedIndex).toBe(1); // No

    // Direct numeric 1 -> select Yes
    process.stdin.emit('data', Buffer.from('1'));
    expect(dock.state.selectedIndex).toBe(0); // Yes

    // Submit with Enter
    process.stdin.emit('data', Buffer.from('\r'));
    expect(decision).toBe(true);

    engine.cleanupSync();
  });

  it('submits allowed=false when Enter is pressed on No selection', () => {
    let decision: boolean | null = null;
    const dock = new FilePermissionDock({
      request: {
        kind: 'overwrite',
        filePath: 'config.json',
        before: '{}',
        after: '{"updated": true}',
      },
      onDecision: (allowed) => {
        decision = allowed;
      },
    });

    const engine = new TerminalEngine();
    engine.mount(dock, { kind: 'dock' });

    // Select No
    process.stdin.emit('data', Buffer.from('2'));
    expect(dock.state.selectedIndex).toBe(1);

    // Enter
    process.stdin.emit('data', Buffer.from('\r'));
    expect(decision).toBe(false);

    engine.cleanupSync();
  });

  it('cancels/denies on Esc key in normal mode', () => {
    let decision: boolean | null = null;
    const dock = new FilePermissionDock({
      request: {
        kind: 'edit',
        filePath: 'src/main.ts',
        before: 'const a = 1;',
        after: 'const a = 2;',
      },
      onDecision: (allowed) => {
        decision = allowed;
      },
    });

    const engine = new TerminalEngine();
    engine.mount(dock, { kind: 'dock' });

    process.stdin.emit('data', Buffer.from('\x1b'));
    expect(decision).toBe(false);

    engine.cleanupSync();
  });

  it('transitions to review mode on f/F and toggles back on f/F or Esc', () => {
    const dock = new FilePermissionDock({
      request: {
        kind: 'edit',
        filePath: 'src/main.ts',
        before: 'const a = 1;',
        after: 'const a = 2;',
      },
      onDecision: () => {},
    });

    const engine = new TerminalEngine();
    engine.mount(dock, { kind: 'dock' });

    expect(dock.state.mode).toBe('NORMAL');

    // Press 'f' -> enter review mode
    process.stdin.emit('data', Buffer.from('f'));
    expect(dock.state.mode).toBe('REVIEW');

    // Press 'f' again -> return to normal mode
    process.stdin.emit('data', Buffer.from('f'));
    expect(dock.state.mode).toBe('NORMAL');

    // Press 'F' -> enter review mode
    process.stdin.emit('data', Buffer.from('F'));
    expect(dock.state.mode).toBe('REVIEW');

    // Press Esc in review mode -> return to normal mode without deciding
    process.stdin.emit('data', Buffer.from('\x1b'));
    expect(dock.state.mode).toBe('NORMAL');

    engine.cleanupSync();
  });

  it('supports scrolling with Up/Down in review mode', () => {
    const longContent = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
    const dock = new FilePermissionDock({
      request: {
        kind: 'create',
        filePath: 'long.txt',
        before: null,
        after: longContent,
      },
      onDecision: () => {},
    });

    const engine = new TerminalEngine();
    engine.mount(dock, { kind: 'dock' });

    process.stdin.emit('data', Buffer.from('f'));
    expect(dock.state.mode).toBe('REVIEW');
    expect(dock.state.scrollOffset).toBe(0);

    // Down arrow scrolls
    process.stdin.emit('data', Buffer.from('\x1b[B'));
    expect(dock.state.scrollOffset).toBe(1);

    // Up arrow scrolls back
    process.stdin.emit('data', Buffer.from('\x1b[A'));
    expect(dock.state.scrollOffset).toBe(0);

    // Up arrow at top does not go below 0
    process.stdin.emit('data', Buffer.from('\x1b[A'));
    expect(dock.state.scrollOffset).toBe(0);

    engine.cleanupSync();
  });

  it('cleans up listener on unmount so subsequent inputs do not trigger decisions', () => {
    let decisionCount = 0;
    const dock = new FilePermissionDock({
      request: {
        kind: 'create',
        filePath: 'test.txt',
        before: null,
        after: 'content',
      },
      onDecision: () => {
        decisionCount++;
      },
    });

    const engine = new TerminalEngine();
    engine.mount(dock, { kind: 'dock' });
    engine.unmount(dock);

    // Inject input after unmount
    process.stdin.emit('data', Buffer.from('\r'));
    process.stdin.emit('data', Buffer.from('\x1b'));
    expect(decisionCount).toBe(0);

    engine.cleanupSync();
  });
});
