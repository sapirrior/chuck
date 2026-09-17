import { describe, it, expect } from 'bun:test';
import TerminalEngine from '../../src/tui/engine/TerminalEngine.js';
import Header from '../../src/tui/components/Header.js';
import StatusBar from '../../src/tui/components/StatusBar.js';
import PromptInput from '../../src/tui/components/PromptInput.js';
import StreamingView from '../../src/tui/components/StreamingView.js';
import ShortcutsMenu from '../../src/tui/components/docks/ShortcutsMenu.js';
import ModelPicker from '../../src/tui/components/docks/ModelPicker.js';
import SessionMenu from '../../src/tui/components/docks/SessionMenu.js';
import EffortPicker from '../../src/tui/components/docks/EffortPicker.js';
import RewindMenu from '../../src/tui/components/docks/RewindMenu.js';
import BashPermissionDock from '../../src/tui/components/docks/BashPermissionDock.js';
import TrustGate from '../../src/tui/components/TrustGate.js';
import { formatAssistantMessage, formatToolStatus } from '../../src/tui/utils/message-formatter.js';
import { captureHeadlessRender, assertGoldenMatch } from './harness.js';
import StateRenderer from '../../src/tui/engine/StateRenderer.js';

describe('TUI Engine Headless Golden Snapshots', () => {
  const dummyModel = {
    provider: 'anthropic',
    modelId: 'claude-3-5-sonnet-20241022',
    model_id: 'claude-3-5-sonnet-20241022',
  };

  it('golden: prompt-idle (empty prompt, idle status bar)', () => {
    const engine = new TerminalEngine();
    const header = new Header({
      version: '0.2.0',
      cwd: '/workspace/steward',
      model: dummyModel,
    });
    const prompt = new PromptInput({
      onSubmit: () => {},
    });
    const statusBar = new StatusBar({
      model: dummyModel,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      isBusy: false,
    });

    engine.mount(header, { kind: 'custom' });
    engine.mount(prompt, { kind: 'input', keepCursorVisible: true });
    engine.mount(statusBar, { kind: 'custom' });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('prompt-idle', result.rawAnsi);
  });

  it('golden: prompt-multiline-cursor (multi-line prompt with cursor mid-text)', () => {
    const engine = new TerminalEngine();
    const header = new Header({
      version: '0.2.0',
      cwd: '/workspace/steward',
      model: dummyModel,
    });
    const prompt = new PromptInput({
      onSubmit: () => {},
    });
    prompt.setState({
      value: 'First line of prompt\nSecond line with cursor\nThird line',
      cursorPos: 32, // inside 'Second line with cursor'
    });
    const statusBar = new StatusBar({
      model: dummyModel,
      usage: { promptTokens: 120, completionTokens: 45, totalTokens: 165 },
      isBusy: false,
    });

    engine.mount(header, { kind: 'custom' });
    engine.mount(prompt, { kind: 'input', keepCursorVisible: true });
    engine.mount(statusBar, { kind: 'custom' });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('prompt-multiline-cursor', result.rawAnsi);
  });

  it('golden: prompt-long-wrapped (long prompt text wrapping across visual rows)', () => {
    const engine = new TerminalEngine();
    const header = new Header({
      version: '0.2.0',
      cwd: '/workspace/steward',
      model: dummyModel,
    });
    const prompt = new PromptInput({
      onSubmit: () => {},
    });
    prompt.setState({
      value:
        'This is a very long prompt sentence that definitely exceeds standard terminal eighty columns width and should soft-wrap cleanly across multiple visual rows with correct cursor mapping.',
      cursorPos: 125,
    });
    const statusBar = new StatusBar({
      model: dummyModel,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      isBusy: false,
    });

    engine.mount(header, { kind: 'custom' });
    engine.mount(prompt, { kind: 'input', keepCursorVisible: true });
    engine.mount(statusBar, { kind: 'custom' });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('prompt-long-wrapped', result.rawAnsi);
  });

  it('golden: prompt-esc-pending (prompt with escPending banner)', () => {
    const engine = new TerminalEngine();
    const prompt = new PromptInput({
      onSubmit: () => {},
    });
    prompt.setState({
      value: 'Some unsaved prompt',
      escPending: true,
    });

    engine.mount(prompt, { kind: 'input', keepCursorVisible: true });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('prompt-esc-pending', result.rawAnsi);
  });

  it('golden: prompt-slash-palette (prompt with slash-command palette open)', () => {
    const engine = new TerminalEngine();
    const prompt = new PromptInput({
      onSubmit: () => {},
    });
    prompt.setState({
      value: '/h',
      paletteIdx: 0,
    });

    engine.mount(prompt, { kind: 'input', keepCursorVisible: true });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('prompt-slash-palette', result.rawAnsi);
  });

  it('golden: prompt-file-matches (prompt with @file match list open)', () => {
    const engine = new TerminalEngine();
    const prompt = new PromptInput({
      onSubmit: () => {},
    });
    prompt.setState({
      value: 'inspect @pack',
      fileMatches: ['package.json', 'package-lock.json', 'packages/core/package.json'],
      fileSelectIdx: 1,
    });

    engine.mount(prompt, { kind: 'input', keepCursorVisible: true });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('prompt-file-matches', result.rawAnsi);
  });

  it('golden: streaming-active-tool (StreamingView with active tool call + recent output)', () => {
    const engine = new TerminalEngine();
    const streamView = new StreamingView();
    streamView.setStream('Checking current codebase architecture...', true);
    streamView.setActiveTool({
      id: 'tool-call-1',
      name: 'find_files',
      args: { pattern: 'src/**/*.ts' },
      startTime: 1000,
      recentLines: ['Searching files matching src/**/*.ts', 'Found 36 results'],
    });

    engine.mount(streamView, { kind: 'custom' });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('streaming-active-tool', result.rawAnsi);
  });

  it('golden: streaming-markdown (StreamingView with streamed markdown headers and bullets)', () => {
    const engine = new TerminalEngine();
    const streamView = new StreamingView();
    const markdownContent = [
      '# Architecture Overview',
      '',
      'Here are the core system layers:',
      '- **Layer 0**: Core terminal engine and diff renderer',
      '- **Layer 1**: Content-blind composition primitives',
      '- **Layer 2**: Domain-specific UI components',
      '',
      '```ts',
      'const engine = new TerminalEngine();',
      '```',
    ].join('\n');

    streamView.setStream(markdownContent, true);
    engine.mount(streamView, { kind: 'custom' });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('streaming-markdown', result.rawAnsi);
  });

  it('golden: history-scroll-80 (long history requiring scroll at 80 cols)', () => {
    const engine = new TerminalEngine();
    const header = new Header({
      version: '0.2.0',
      cwd: '/workspace/steward',
      model: dummyModel,
    });
    engine.commit('header', header.render(80));

    for (let i = 1; i <= 10; i++) {
      engine.commitPrompt(`User prompt ${i}: Refactor component ${i} to use Layer 1 primitives.`);
      engine.commit(
        'assistant-message',
        formatAssistantMessage(
          `Assistant response ${i}:\n- Item A for step ${i}\n- Item B with longer explanation text that wraps across multiple lines cleanly.`,
        ),
      );
      engine.commit(
        'tool-result',
        formatToolStatus({
          toolName: `tool_${i}`,
          status: 'completed',
          durationMs: 120,
          argsSummary: 'path: src/tui/app.ts',
        }),
      );
    }

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 6, true);
      },
      { cols: 80, rows: 24, scrollOffset: 6 },
    );

    engine.cleanupSync();
    assertGoldenMatch('history-scroll-80', result.rawAnsi);
  });

  it('golden: history-scroll-120 (long history requiring scroll at 120 cols)', () => {
    const engine = new TerminalEngine();
    const header = new Header({
      version: '0.2.0',
      cwd: '/workspace/steward',
      model: dummyModel,
    });
    engine.commit('header', header.render(120));

    for (let i = 1; i <= 10; i++) {
      engine.commitPrompt(`User prompt ${i}: Refactor component ${i} to use Layer 1 primitives.`);
      engine.commit(
        'assistant-message',
        formatAssistantMessage(
          `Assistant response ${i}:\n- Item A for step ${i}\n- Item B with longer explanation text that wraps across multiple lines cleanly.`,
        ),
      );
      engine.commit(
        'tool-result',
        formatToolStatus({
          toolName: `tool_${i}`,
          status: 'completed',
          durationMs: 120,
          argsSummary: 'path: src/tui/app.ts',
        }),
      );
    }

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 6, true);
      },
      { cols: 120, rows: 24, scrollOffset: 6 },
    );

    engine.cleanupSync();
    assertGoldenMatch('history-scroll-120', result.rawAnsi);
  });

  it('golden: resize-mid-session (resize event from 80x24 to 120x30)', () => {
    const engine = new TerminalEngine();
    const header = new Header({
      version: '0.2.0',
      cwd: '/workspace/steward',
      model: dummyModel,
    });
    const prompt = new PromptInput({
      onSubmit: () => {},
    });
    prompt.setState({ value: 'Testing resize reflow behavior' });

    engine.mount(header, { kind: 'custom' });
    engine.commitPrompt('Initial prompt before resize');
    engine.mount(prompt, { kind: 'input', keepCursorVisible: true });

    const sharedRenderer = new StateRenderer();

    // Initial frame at 80x24
    captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
      sharedRenderer,
    );

    // Frame after resize to 120x30
    engine.tree.invalidateCache();
    const resizedResult = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, false);
      },
      { cols: 120, rows: 30 },
      sharedRenderer,
    );

    engine.cleanupSync();
    assertGoldenMatch('resize-mid-session', resizedResult.rawAnsi);
  });

  it('golden: dock-shortcuts-menu (ShortcutsMenu dock open)', () => {
    const engine = new TerminalEngine();
    const shortcutsMenu = new ShortcutsMenu({
      onClose: () => {},
    });

    engine.mount(shortcutsMenu, { kind: 'dock' });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('dock-shortcuts-menu', result.rawAnsi);
  });

  it('golden: dock-model-picker (ModelPicker dock open)', () => {
    const engine = new TerminalEngine();
    const modelPicker = new ModelPicker({
      models: [
        {
          provider: 'anthropic',
          model_id: 'claude-3-5-sonnet-20241022',
          capabilities: { completion_chat: true, function_calling: true },
        },
        {
          provider: 'openai',
          model_id: 'gpt-4o',
          capabilities: { completion_chat: true, function_calling: true },
        },
        {
          provider: 'google',
          model_id: 'gemini-1.5-pro',
          capabilities: { completion_chat: true, function_calling: true },
        },
      ],
      currentModel: dummyModel,
      onSelect: () => {},
      onCancel: () => {},
    });

    engine.mount(modelPicker, { kind: 'dock' });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('dock-model-picker', result.rawAnsi);
  });

  it('golden: dock-session-menu (SessionMenu dock open)', () => {
    const engine = new TerminalEngine();
    const sessionMenu = new SessionMenu({
      sessions: [
        {
          id: 'sess-abc-12345678',
          name: 'TUI Refactor Session',
          date: '2026-09-16T01:00:00.000Z',
          turns: [
            {
              id: 'turn-1',
              timestamp: 1000,
              userPrompt: 'Implement Phase 0 snapshot tests',
              messages: [],
            },
            {
              id: 'turn-2',
              timestamp: 2000,
              userPrompt: 'Verify golden frames',
              messages: [],
            },
          ],
        } as any,
        {
          id: 'sess-def-87654321',
          name: 'Provider Discovery',
          date: '2026-09-15T12:00:00.000Z',
          turns: [
            {
              id: 'turn-1',
              timestamp: 1000,
              userPrompt: 'Add mistral and deepseek',
              messages: [],
            },
          ],
        } as any,
      ],
      onSelect: () => {},
      onCancel: () => {},
    });

    engine.mount(sessionMenu, { kind: 'dock' });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('dock-session-menu', result.rawAnsi);
  });

  it('golden: dock-effort-picker (EffortPicker horizontal slider dock open)', () => {
    const engine = new TerminalEngine();
    const effortPicker = new EffortPicker({
      currentEffort: 'low',
      onSelect: () => {},
      onCancel: () => {},
    });

    engine.mount(effortPicker, { kind: 'dock' });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('dock-effort-picker', result.rawAnsi);
  });

  it('golden: trust-gate-no (TrustGate with No, exit selected by default)', () => {
    const engine = new TerminalEngine();
    const trustGate = new TrustGate({
      cwd: '/workspace/steward',
      onDecision: () => {},
    });

    engine.mount(trustGate, { kind: 'custom' });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('trust-gate-no', result.rawAnsi);
  });

  it('golden: trust-gate-yes (TrustGate with Yes selected)', () => {
    const engine = new TerminalEngine();
    const trustGate = new TrustGate({
      cwd: '/workspace/steward',
      onDecision: () => {},
    });
    trustGate.setState({ selectedIndex: 0 });

    engine.mount(trustGate, { kind: 'custom' });

    const result = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine.cleanupSync();
    assertGoldenMatch('trust-gate-yes', result.rawAnsi);
  });

  it('golden: dock-rewind-menu (RewindMenu dock open at 80 and 120 cols)', () => {
    const dummySession = {
      id: 'sess-rewind-1234',
      name: 'Testing Rewind Menu',
      date: '2026-09-16',
      createdAt: '2026-09-16T10:00:00.000Z',
      updatedAt: '2026-09-16T10:30:00.000Z',
      model: dummyModel,
      totalUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      turns: [
        {
          id: 'turn-1',
          timestamp: '2026-09-16T10:05:00.000Z',
          status: 'complete',
          usage: { inputTokens: 30, outputTokens: 60, totalTokens: 90 },
          messages: [{ role: 'user', content: 'Create src/components/Button.tsx' }],
        },
        {
          id: 'turn-2',
          timestamp: '2026-09-16T10:15:00.000Z',
          status: 'complete',
          usage: { inputTokens: 40, outputTokens: 80, totalTokens: 120 },
          messages: [{ role: 'user', content: 'Refactor Button styles and add primary variant' }],
        },
        {
          id: 'turn-3',
          timestamp: '2026-09-16T10:25:00.000Z',
          status: 'complete',
          usage: { inputTokens: 30, outputTokens: 60, totalTokens: 90 },
          messages: [{ role: 'user', content: 'Add unit test suite for Button component' }],
        },
      ],
    } as any;

    const engine80 = new TerminalEngine();
    const rewindMenu80 = new RewindMenu({
      session: dummySession,
      cwd: '/workspace/steward',
      onSelect: () => {},
      onCancel: () => {},
    });

    engine80.mount(rewindMenu80, { kind: 'dock' });

    const result80 = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine80.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine80.cleanupSync();
    assertGoldenMatch('dock-rewind-menu', result80.rawAnsi);

    const engine120 = new TerminalEngine();
    const rewindMenu120 = new RewindMenu({
      session: dummySession,
      cwd: '/workspace/steward',
      onSelect: () => {},
      onCancel: () => {},
    });

    engine120.mount(rewindMenu120, { kind: 'dock' });

    const result120 = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine120.tree, 0, true);
      },
      { cols: 120, rows: 24 },
    );

    engine120.cleanupSync();
    assertGoldenMatch('dock-rewind-menu-120', result120.rawAnsi);
  });

  it('golden: bash-permission-dock (BashPermissionDock open at 80 cols)', () => {
    const engine80 = new TerminalEngine();
    const dock80 = new BashPermissionDock({
      command: 'bun test tests/tools/bash.test.ts',
      explanation: 'Run bash test suite to verify command policy and execution safety',
      onDecision: () => {},
    });

    engine80.mount(dock80, { kind: 'dock' });

    const result80 = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine80.tree, 0, true);
      },
      { cols: 80, rows: 24 },
    );

    engine80.cleanupSync();
    assertGoldenMatch('bash-permission-dock', result80.rawAnsi);
  });

  it('golden: bash-permission-dock-120 (BashPermissionDock open at 120 cols)', () => {
    const engine120 = new TerminalEngine();
    const dock120 = new BashPermissionDock({
      command: 'bun test tests/tools/bash.test.ts',
      explanation: 'Run bash test suite to verify command policy and execution safety',
      onDecision: () => {},
    });

    engine120.mount(dock120, { kind: 'dock' });

    const result120 = captureHeadlessRender(
      (renderer) => {
        return renderer.render(engine120.tree, 0, true);
      },
      { cols: 120, rows: 24 },
    );

    engine120.cleanupSync();
    assertGoldenMatch('bash-permission-dock-120', result120.rawAnsi);
  });
});
