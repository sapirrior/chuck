import { describe, it, expect } from 'bun:test';
import StreamingView from '../../src/tui/components/StreamingView.js';
import stripAnsi from 'strip-ansi';

describe('StreamingView Thinking Indicator & Transitions', () => {
  it('renders blinking bullet with Thinking.. and subline status', () => {
    const view = new StreamingView();
    view.setThinking(true);

    const rendered = view.render(80);
    expect(rendered.length).toBe(2);

    const plainFirst = stripAnsi(rendered[0]!);
    const plainSecond = stripAnsi(rendered[1]!);

    expect(plainFirst).toContain('Thinking..');
    expect(plainSecond).toContain('└');

    view.reset();
  });

  it('immediately replaces Thinking.. when text stream starts', () => {
    const view = new StreamingView();
    view.setThinking(true);

    expect(stripAnsi(view.render(80)[0]!)).toContain('Thinking..');

    // Assistant text starts streaming
    view.setStream('Here is the explanation.', true);
    const rendered = view.render(80);

    const textJoined = rendered.map((l) => stripAnsi(l)).join('\n');
    expect(textJoined).not.toContain('Thinking..');
    expect(textJoined).toContain('Here is the explanation.');

    view.reset();
  });

  it('immediately replaces Thinking.. when active tool starts', () => {
    const view = new StreamingView();
    view.setThinking(true);

    expect(stripAnsi(view.render(80)[0]!)).toContain('Thinking..');

    // Tool call starts
    view.setActiveTool({
      id: 'tool-1',
      name: 'bash',
      displayName: 'Bash',
      args: { command: 'ls -la' },
      startTime: performance.now(),
    });

    const rendered = view.render(80);
    const textJoined = rendered.map((l) => stripAnsi(l)).join('\n');
    expect(textJoined).not.toContain('Thinking..');
    expect(textJoined).toContain('Bash(ls -la)');

    view.reset();
  });
});
