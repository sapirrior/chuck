import { describe, it, expect } from 'bun:test';
import { formatSystemMessage } from '../../src/tui/utils/message-formatter.js';
import { wrapVisualLine } from '../../src/tui/engine/cell-layout.js';
import { truncateToWidth, stripAnsi } from '../../src/tui/utils/format.js';
import stringWidth from 'string-width';
import StatusBar from '../../src/tui/components/StatusBar.js';
import HelpMenu from '../../src/tui/components/docks/HelpMenu.js';
import CommandPalette from '../../src/tui/components/docks/CommandPalette.js';

describe('Phase 0 Hotfixes', () => {
  it('formatSystemMessage splits multi-line content into separate entries and never has raw \\n', () => {
    const multiLine = 'First line\nSecond line\nThird line';
    const lines = formatSystemMessage(multiLine);
    expect(lines.length).toBe(3);
    for (const l of lines) {
      expect(l).not.toContain('\n');
      expect(l).not.toContain('\r');
    }
  });

  it('wrapVisualLine defensively handles stray newlines', () => {
    const inputWithNewlines = 'Hello\nWorld\r\nTest';
    const wrapped = wrapVisualLine(inputWithNewlines, 40);
    for (const seg of wrapped) {
      expect(seg).not.toContain('\n');
      expect(seg).not.toContain('\r');
    }
  });

  it('truncateToWidth truncates ANSI strings safely without exceeding visible maxWidth', () => {
    const styled = '\x1b[31mRed \x1b[1mBold Text\x1b[0m and plain text';
    const truncated = truncateToWidth(styled, 8);
    const visibleWidth = stringWidth(stripAnsi(truncated));
    expect(visibleWidth).toBeLessThanOrEqual(8);
    if (truncated.includes('\x1b')) {
      expect(truncated.endsWith('\x1b[0m')).toBe(true);
    }
  });

  it('StatusBar, HelpMenu, and CommandPalette never exceed termWidth - 1', () => {
    const widths = [20, 40, 60, 80, 120];

    for (const w of widths) {
      const maxCols = w - 1;

      // StatusBar
      const statusBar = new StatusBar({
        model: {
          provider: 'anthropic-very-long-provider-name',
          modelId: 'claude-3-7-sonnet-long-model-id',
        },
        usage: {
          inputTokens: 100000,
          outputTokens: 50000,
          totalTokens: 150000,
          contextWindow: 200000,
        },
        isBusy: false,
      });
      const statusLines = statusBar.render(w);
      for (const line of statusLines) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // HelpMenu
      const helpMenu = new HelpMenu({ onClose: () => {} });
      const helpLines = helpMenu.render(w);
      for (const line of helpLines) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // CommandPalette
      const cmdPalette = new CommandPalette({
        commands: [
          {
            name: 'verylongcommandname',
            description: 'This is a very long description that might overflow narrow screens',
            usage: '/verylongcommandname',
            execute: async () => ({ handled: true }),
          },
        ],
        selectedIndex: 0,
      });
      const cmdLines = cmdPalette.render(w);
      for (const line of cmdLines) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }
    }
  });
});
