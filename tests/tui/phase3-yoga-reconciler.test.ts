import { describe, it, expect } from 'bun:test';
import {
  box,
  text,
  layoutAndPaint,
  renderLayoutToLines,
  Justify,
} from '../../src/tui/layout/index.js';
import StatusBar from '../../src/tui/components/StatusBar.js';
import CommandPalette from '../../src/tui/components/docks/CommandPalette.js';
import HelpMenu from '../../src/tui/components/docks/HelpMenu.js';
import ModelPicker from '../../src/tui/components/docks/ModelPicker.js';
import SessionMenu from '../../src/tui/components/docks/SessionMenu.js';
import PermissionDock from '../../src/tui/components/docks/PermissionDock.js';
import Header from '../../src/tui/components/Header.js';
import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';

describe('Phase 3: Yoga Layout Integration and Component Reconciler', () => {
  it('computes Flexbox layout and paints row boxes into ScreenBuffer', () => {
    const layoutNode = box(
      { direction: 'row', width: 40, justify: Justify.SpaceBetween },
      text('Left Title'),
      text('Right Metadata'),
    );

    const { buffer, computedWidth, computedHeight } = layoutAndPaint(layoutNode, 40);
    expect(computedWidth).toBe(40);
    expect(computedHeight).toBe(1);

    const row = buffer.getRow(0);
    expect(row).toContain('Left Title');
    expect(row).toContain('Right Metadata');
    expect(stringWidth(stripAnsi(row))).toBeLessThanOrEqual(40);
  });

  it('verifies all migrated components renderLayout produce valid lines via _getLines() across widths', () => {
    const widths = [40, 80, 120, 200];

    for (const w of widths) {
      const maxCols = w - 1;

      // 1. StatusBar
      const statusBar = new StatusBar({
        model: { provider: 'anthropic', modelId: 'claude-3-7-sonnet' },
        usage: { inputTokens: 500, outputTokens: 1000, totalTokens: 1500, contextWindow: 200000 },
        isBusy: false,
      });
      const statusLines = statusBar._getLines(maxCols, true);
      expect(statusLines.length).toBeGreaterThan(0);
      for (const line of statusLines) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // 2. CommandPalette
      const cmdPalette = new CommandPalette({
        commands: [
          {
            name: 'model',
            description: 'Switch model',
            usage: '/model',
            execute: async () => ({ handled: true }),
          },
        ],
        selectedIndex: 0,
      });
      const cmdLines = cmdPalette._getLines(maxCols, true);
      expect(cmdLines.length).toBeGreaterThan(0);
      for (const line of cmdLines) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // 3. HelpMenu
      const helpMenu = new HelpMenu({ onClose: () => {} });
      const helpLines = helpMenu._getLines(maxCols, true);
      expect(helpLines.length).toBeGreaterThan(0);
      for (const line of helpLines) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // 4. ModelPicker
      const modelPicker = new ModelPicker({
        models: [{ provider: 'openai', model_id: 'gpt-4o', display_name: 'GPT-4o' }],
        currentModel: { provider: 'openai', modelId: 'gpt-4o' },
        onSelect: () => {},
        onCancel: () => {},
      });
      const modelLines = modelPicker._getLines(maxCols, true);
      expect(modelLines.length).toBeGreaterThan(0);
      for (const line of modelLines) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // 5. SessionMenu
      const sessionMenu = new SessionMenu({
        sessions: [
          {
            id: 'sess-12345678',
            date: '2026-09-12',
            name: 'Session Test',
            turns: [],
            totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextWindow: 200000 },
          },
        ],
        onSelect: () => {},
        onCancel: () => {},
      });
      const sessionLines = sessionMenu._getLines(maxCols, true);
      expect(sessionLines.length).toBeGreaterThan(0);
      for (const line of sessionLines) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // 6. PermissionDock
      const permissionDock = new PermissionDock({
        request: {
          toolName: 'run_command',
          displayName: 'Bash Command',
          args: { command: 'ls -la' },
        },
        onDecision: () => {},
      });
      const permLines = permissionDock._getLines(maxCols, true);
      expect(permLines.length).toBeGreaterThan(0);
      for (const line of permLines) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // 7. Header
      const header = new Header({
        version: '0.1.0',
        cwd: '/home/works/xd',
        model: { provider: 'anthropic', modelId: 'claude-3-7-sonnet' },
      });
      const headerLines = header._getLines(maxCols, true);
      expect(headerLines.length).toBeGreaterThan(0);
      for (const line of headerLines) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }
    }
  });
});
