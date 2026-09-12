import { describe, it, expect } from 'bun:test';
import PromptInput from '../../src/tui/components/PromptInput.js';
import PermissionDock from '../../src/tui/components/docks/PermissionDock.js';
import StatusBar from '../../src/tui/components/StatusBar.js';
import Header from '../../src/tui/components/Header.js';
import CommandPalette from '../../src/tui/components/docks/CommandPalette.js';
import HelpMenu from '../../src/tui/components/docks/HelpMenu.js';
import { measureNode } from '../../src/tui/engine/cell-layout.js';
import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';

describe('Component Overflow and Truncation Invariants', () => {
  it('PromptInput allows natural wrapping without truncating user typed input', () => {
    const input = new PromptInput({ onSubmit: () => {} });
    expect(input.overflow).toBe('wrap');
    expect(input.truncation).toBe('none');

    // Simulate typing a long text of 120 chars at terminal width 40
    const longPrompt =
      'This is a very long user input message that should wrap onto multiple lines instead of being truncated by the input box.';
    input.setState({ value: longPrompt, cursorPos: longPrompt.length });

    const width = 40;
    const { rows, cursorWithinNode } = measureNode(input, width);

    // The user input line must wrap across multiple rows
    expect(rows.length).toBeGreaterThan(3);

    // Total content of wrapped input segments should contain the full prompt (no lost characters)
    const combinedContent = rows.map((r) => stripAnsi(r.text)).join(' ');
    expect(combinedContent).toContain('This is a very long user input message');
    expect(combinedContent).toContain('instead of being truncated');

    // Cursor should be at the end of the last wrapped line
    expect(cursorWithinNode).not.toBeNull();
    expect(cursorWithinNode?.row).toBeGreaterThan(1);
  });

  it('PermissionDock strictly clips updated content and diffs without overflowing modal bounds', () => {
    const longContent =
      'const veryLongVariableNameThatExtendsFarBeyondTheNormalTerminalBoundary = ' +
      'A'.repeat(200);
    const dock = new PermissionDock({
      request: {
        id: 'test-req',
        displayName: 'Edit File',
        toolName: 'edit_file',
        args: {
          path: '/path/to/file.ts',
          oldContent: 'const a = 1;',
          newContent: longContent,
        },
      },
      onDecision: () => {},
    });

    expect(dock.overflow).toBe('hidden');
    expect(dock.truncation).toBe('clip');

    for (const width of [30, 50, 80, 120]) {
      const { rows } = measureNode(dock, width);
      for (const row of rows) {
        const visWidth = stringWidth(stripAnsi(row.text));
        expect(visWidth).toBeLessThanOrEqual(width);
      }
    }
  });

  it('All dock and chrome components respect max width limits', () => {
    const status = new StatusBar({
      model: {
        provider: 'openai',
        modelId: 'gpt-4o-extra-long-model-name-specification-identifier',
      },
      usage: { promptTokens: 50000, completionTokens: 12000, totalTokens: 62000 },
      isBusy: false,
    });
    expect(status.overflow).toBe('hidden');
    expect(status.truncation).toBe('clip');

    const header = new Header({ version: '1.0.0' });
    expect(header.overflow).toBe('hidden');
    expect(header.truncation).toBe('clip');

    const cmdPalette = new CommandPalette({
      commands: [
        {
          name: 'superlongcommandname',
          description:
            'This is an extremely long command description that must be truncated within narrow terminals',
          handler: async () => {},
        },
      ],
      selectedIndex: 0,
    });
    expect(cmdPalette.overflow).toBe('hidden');
    expect(cmdPalette.truncation).toBe('clip');

    const help = new HelpMenu({ onClose: () => {} });
    expect(help.overflow).toBe('hidden');
    expect(help.truncation).toBe('clip');

    for (const width of [25, 40, 80]) {
      for (const comp of [status, header, cmdPalette, help]) {
        const { rows } = measureNode(comp, width);
        for (const row of rows) {
          const visWidth = stringWidth(stripAnsi(row.text));
          expect(visWidth).toBeLessThanOrEqual(width);
        }
      }
    }
  });
});
