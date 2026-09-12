import { describe, it, expect } from 'bun:test';
import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import { assertRowWidth, measureNode } from '../../src/tui/engine/cell-layout.js';
import Header from '../../src/tui/components/Header.js';
import StatusBar from '../../src/tui/components/StatusBar.js';
import PromptInput from '../../src/tui/components/PromptInput.js';
import StreamingView from '../../src/tui/components/StreamingView.js';
import HelpMenu from '../../src/tui/components/docks/HelpMenu.js';
import CommandPalette from '../../src/tui/components/docks/CommandPalette.js';
import ModelPicker from '../../src/tui/components/docks/ModelPicker.js';
import SessionMenu from '../../src/tui/components/docks/SessionMenu.js';
import PermissionDock from '../../src/tui/components/docks/PermissionDock.js';

function generateRandomAnsiString(targetWidth: number): string {
  const colors = [
    '\x1b[31m',
    '\x1b[32m',
    '\x1b[33m',
    '\x1b[34m',
    '\x1b[35m',
    '\x1b[36m',
    '\x1b[1m',
    '\x1b[2m',
  ];
  const reset = '\x1b[0m';
  let s = '';
  let curWidth = 0;
  while (curWidth < targetWidth) {
    const color = colors[Math.floor(Math.random() * colors.length)] ?? '';
    const char = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    s += `${color}${char}${reset}`;
    curWidth += 1;
  }
  return s;
}

describe('Phase 1: Hard Width Invariant Across Engine and Components', () => {
  const testWidths = [20, 40, 80, 120, 200];

  it('assertRowWidth clamps any row exceeding maxCols', () => {
    for (const w of testWidths) {
      const maxCols = w - 1;
      for (const offset of [-5, -1, 0, 1, 5, 50]) {
        const inputStr = generateRandomAnsiString(Math.max(1, w + offset));
        const clamped = assertRowWidth(inputStr, maxCols);
        expect(stringWidth(stripAnsi(clamped))).toBeLessThanOrEqual(maxCols);
      }
    }
  });

  it('Fuzz test: all components respect termWidth - 1 at widths 20, 40, 80, 120, 200', () => {
    for (const termWidth of testWidths) {
      const maxCols = termWidth - 1;

      // 1. Header
      const header = new Header({
        version: '1.0.0-fuzz-test-long-version',
        cwd: '/a/very/long/nested/directory/path/that/might/exceed/terminal/boundaries',
        model: { provider: 'anthropic-provider-extended', modelId: 'claude-3-7-sonnet-fuzz-test' },
      });
      for (const row of measureNode(header, maxCols).rows) {
        expect(stringWidth(stripAnsi(row.text))).toBeLessThanOrEqual(maxCols);
      }

      // 2. StatusBar
      for (const tokens of [0, 500, 15000, 2500000, 1500000000]) {
        const statusBar = new StatusBar({
          model: {
            provider: 'custom-open-router-enterprise',
            modelId: 'deepseek-ai/deepseek-r1-distill-llama-70b',
          },
          usage: {
            inputTokens: tokens,
            outputTokens: tokens,
            totalTokens: tokens * 2,
            contextWindow: 200000,
          },
          isBusy: true,
          exitPending: true,
        });
        for (const line of statusBar.render(termWidth)) {
          expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
        }
      }

      // 3. PromptInput
      const promptInput = new PromptInput({
        onSubmit: () => {},
        cwd: '/very/long/workspace/path/for/prompt/input/testing',
      });
      for (const line of promptInput.render(termWidth)) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // 4. StreamingView
      const streamingView = new StreamingView();
      streamingView.setStream(
        'Here is very long reasoning content that runs on and on without line breaks and contains technical terms',
        '# Markdown Heading\n\nHere is a very long paragraph of response text that should wrap cleanly to terminal width.\n- List item 1 with detailed explanation\n- List item 2 with code `const x = 123456789;`',
        true,
      );
      for (const line of streamingView.render(termWidth)) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // 5. HelpMenu
      const helpMenu = new HelpMenu({ onClose: () => {} });
      for (const line of helpMenu.render(termWidth)) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // 6. CommandPalette
      const commandPalette = new CommandPalette({
        commands: [
          {
            name: 'super-ultra-long-command-name-test',
            description:
              'This is an excessively long description intended to test horizontal overflow boundary handling in command palette',
            usage: '/super-ultra-long-command-name-test',
            execute: async () => ({ handled: true }),
          },
        ],
        selectedIndex: 0,
      });
      for (const line of commandPalette.render(termWidth)) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // 7. ModelPicker
      const modelPicker = new ModelPicker({
        models: [
          {
            provider: 'anthropic-enterprise-cloud-provider',
            model_id: 'claude-3-7-sonnet-20250219-thinking-preview-ultra-long-id',
            display_name: 'Claude 3.7 Sonnet',
          },
        ],
        currentModel: {
          provider: 'anthropic-enterprise-cloud-provider',
          modelId: 'claude-3-7-sonnet-20250219-thinking-preview-ultra-long-id',
        },
        onSelect: () => {},
        onCancel: () => {},
      });
      for (const line of modelPicker.render(termWidth)) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // 8. SessionMenu
      const sessionMenu = new SessionMenu({
        sessions: [
          {
            id: 'session-id-12345678-90ab-cdef-1234-567890abcdef',
            date: '2026-09-12 14:30:00 UTC (Long Timestamp)',
            name: 'A very long custom session title describing a complex refactor and architectural migration in full detail',
            turns: [
              {
                userPrompt:
                  'This is the initial prompt of the session which is also very long and detailed',
                assistantResponse: 'Response',
                toolCalls: [],
                timestamp: Date.now(),
              },
            ],
            totalUsage: {
              inputTokens: 1000,
              outputTokens: 2000,
              totalTokens: 3000,
              contextWindow: 200000,
            },
          },
        ],
        onSelect: () => {},
        onCancel: () => {},
      });
      for (const line of sessionMenu.render(termWidth)) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }

      // 9. PermissionDock
      const permissionDock = new PermissionDock({
        request: {
          toolName: 'run_command',
          displayName: 'Execute Shell Command with Very Long Name and Flags',
          promptTitle:
            'Execute dangerous terminal command across multiple directories with sudo privileges',
          args: {
            command:
              'echo "very long command line with lots of arguments --flag1 --flag2 --flag3 --option=value --verbose --output=/path/to/very/long/output/file.json"',
          },
        },
        onDecision: () => {},
      });
      for (const line of permissionDock.render(termWidth)) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(maxCols);
      }
    }
  });
});
