import { randomUUID } from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import TerminalEngine from './engine/TerminalEngine.js';
import { AgentSession } from '../engine/agent-session.js';
import { defaultCommandRegistry } from '../commands/registry.js';
import { defaultToolCatalog } from '../tools/index.js';
import type { ConfirmationDecision, ConfirmationRequest, ToolContext } from '../tools/types.js';
import type { ModelDescriptor } from '../models/index.js';
import type { SessionData } from '../session/types.js';
import { listSessions, loadSession } from '../session/index.js';
import { saveSettings } from '../config/index.js';
import Header from './components/Header.js';
import StatusBar from './components/StatusBar.js';
import StreamingView from './components/StreamingView.js';
import PromptInput from './components/PromptInput.js';
import PermissionDock from './components/docks/PermissionDock.js';
import ModelPicker from './components/docks/ModelPicker.js';
import SessionMenu from './components/docks/SessionMenu.js';
import HelpMenu from './components/docks/HelpMenu.js';
import {
  formatUserMessage,
  formatSystemMessage,
  formatAssistantMessage,
  formatToolStatus,
  formatErrorBadge,
  formatTurnStatus,
} from './utils/message-formatter.js';
import { formatToolOutputSummary, rehydrateSessionHistory } from '../utils/history-helpers.js';
import { classifyError } from '../errors/index.js';
import { executeShellCommand } from '../shell/index.js';

export interface TUIAppOptions {
  initialSession?: AgentSession;
  cwd?: string;
  onExit?: () => void;
}

export class TUIApp {
  private engine: TerminalEngine;
  private session: AgentSession;
  private cwd: string;
  private onExitCallback?: () => void;

  private header: Header;
  private streamingView: StreamingView;
  private promptInput: PromptInput;
  private statusBar: StatusBar;

  private activeModal: PermissionDock | ModelPicker | SessionMenu | HelpMenu | null = null;
  private sessionAllowlist = new Set<string>();
  private ctrlCPending = false;
  private ctrlCTimer: NodeJS.Timeout | null = null;
  private isBusy = false;

  constructor(options: TUIAppOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.session = options.initialSession ?? new AgentSession();
    this.onExitCallback = options.onExit;
    this.engine = new TerminalEngine();

    const model = this.session.getModel();

    this.header = new Header({
      cwd: this.cwd,
      model,
    });

    this.streamingView = new StreamingView();

    this.promptInput = new PromptInput({
      onSubmit: (text, isBash) => this.handleSubmit(text, isBash),
      onAbort: () => this.handleAbort(),
      onToggleHelp: () => this.toggleHelp(),
      cwd: this.cwd,
      initialHistory: this.session.session.turns
        .map((t) => t.userPrompt)
        .filter((p): p is string => Boolean(p && p.trim())),
    });

    this.statusBar = new StatusBar({
      model,
      usage: this.session.session.totalUsage,
      isBusy: false,
    });
  }

  public async start(): Promise<void> {
    this.engine.ensureAlternateScreen();

    // Commit Header at the top of history
    this.engine.commit('header', this.header.render());

    // Rehydrate previous session turns if any
    const turns = this.session.session.turns;
    if (turns.length > 0) {
      const items = rehydrateSessionHistory(this.session.session);
      for (const item of items) {
        if (item.type === 'user') {
          this.engine.commitPrompt(item.content);
        } else if (item.type === 'bash') {
          this.engine.commitPrompt(item.content, true);
        } else if (item.type === 'system') {
          this.engine.commit('system', formatSystemMessage(item.content));
        } else if (item.type === 'tool' && item.toolData) {
          const toolDef = defaultToolCatalog.get(item.toolData.toolName);
          this.engine.commit(
            'tool-result',
            formatToolStatus({
              toolName: item.toolData.toolName,
              displayName: item.toolData.displayName ?? toolDef?.displayName,
              icon: item.toolData.icon ?? toolDef?.icon,
              argsSummary: item.toolData.argsSummary,
              status: item.toolData.status,
              durationMs: item.toolData.durationMs,
              error: item.toolData.error,
              toolOutput: item.toolData.toolOutput,
              previewLines: item.toolData.previewLines,
              diffLines: item.toolData.diffLines,
              highlightLineIndex: item.toolData.highlightLineIndex,
              highlightCount: item.toolData.highlightCount,
              totalLines: item.toolData.totalLines,
            }),
          );
        } else if (item.type === 'assistant') {
          this.engine.commit('assistant-message', formatAssistantMessage(item.content));
        }
      }
    }

    // Mount live interactive components at the bottom
    this.engine.mount(this.streamingView);
    this.engine.mount(this.promptInput, { keepCursorVisible: true, kind: 'input' });
    this.engine.mount(this.statusBar);

    // Global Ctrl+C handler
    this.engine.addInputListener((chunk) => {
      const str = chunk.toString();
      if (str === '\x03') {
        // Ctrl+C
        if (this.isBusy) {
          this.session.abort();
          return true;
        }

        if (this.activeModal) {
          this.closeModal();
          return true;
        }

        if (this.ctrlCPending) {
          if (this.ctrlCTimer) clearTimeout(this.ctrlCTimer);
          this.exit();
        } else {
          this.ctrlCPending = true;
          this.statusBar.update({ exitPending: true });
          if (this.ctrlCTimer) clearTimeout(this.ctrlCTimer);
          this.ctrlCTimer = setTimeout(() => {
            this.ctrlCPending = false;
            this.statusBar.update({ exitPending: false });
          }, 1500);
        }
        return true;
      }
      return false;
    });
  }

  private closeModal(): void {
    if (this.activeModal) {
      this.engine.unmount(this.activeModal);
      this.engine.unmount(this.statusBar);
      this.activeModal = null;
      this.engine.mount(this.promptInput, { keepCursorVisible: true, kind: 'input' });
      this.engine.mount(this.statusBar);
    }
  }

  private toggleHelp(): void {
    if (this.activeModal instanceof HelpMenu) {
      this.closeModal();
      return;
    }
    this.openHelp();
  }

  private openHelp(): void {
    if (this.activeModal) this.closeModal();
    this.engine.unmount(this.promptInput);
    this.engine.unmount(this.statusBar);

    const help = new HelpMenu({
      onClose: () => this.closeModal(),
    });
    this.activeModal = help;
    this.engine.mount(help, { kind: 'dock' });
    this.engine.mount(this.statusBar);
  }

  private openModelPicker(models: ModelDescriptor[]): void {
    if (this.activeModal) this.closeModal();
    this.engine.unmount(this.promptInput);
    this.engine.unmount(this.statusBar);

    const currentModel = this.session.getModel();
    const picker = new ModelPicker({
      models,
      currentModel,
      onSelect: (selected) => {
        this.session.setModel({
          provider: selected.provider,
          modelId: selected.model_id,
        });
        saveSettings({
          model: {
            provider: selected.provider,
            modelId: selected.model_id,
          },
        });
        const updated = this.session.getModel();
        this.header.props.model = updated;
        this.statusBar.update({ model: updated });
        this.engine.commit(
          'system',
          formatSystemMessage(`Active model switched to ${selected.provider}/${selected.model_id}`),
        );
        this.closeModal();
      },
      onCancel: () => this.closeModal(),
    });

    this.activeModal = picker;
    this.engine.mount(picker, { kind: 'dock' });
    this.engine.mount(this.statusBar);
  }

  private switchToSession(selected: SessionData): void {
    this.session = AgentSession.resume(selected);
    const model = this.session.getModel();
    this.header.props.model = model;
    this.statusBar.update({ model, usage: this.session.session.totalUsage });

    // Clear engine and rehydrate
    this.engine.clearAll();
    this.engine.commit('header', this.header.render());

    const items = rehydrateSessionHistory(selected);
    for (const item of items) {
      if (item.type === 'user') {
        this.engine.commitPrompt(item.content);
      } else if (item.type === 'bash') {
        this.engine.commitPrompt(item.content, true);
      } else if (item.type === 'system') {
        this.engine.commit('system', formatSystemMessage(item.content));
      } else if (item.type === 'tool' && item.toolData) {
        this.engine.commit(
          'tool-result',
          formatToolStatus({
            toolName: item.toolData.toolName,
            displayName: item.toolData.displayName,
            icon: item.toolData.icon,
            argsSummary: item.toolData.argsSummary,
            status: item.toolData.status,
            durationMs: item.toolData.durationMs,
            error: item.toolData.error,
            toolOutput: item.toolData.toolOutput,
            previewLines: item.toolData.previewLines,
            diffLines: item.toolData.diffLines,
            highlightLineIndex: item.toolData.highlightLineIndex,
            highlightCount: item.toolData.highlightCount,
            totalLines: item.toolData.totalLines,
          }),
        );
      } else if (item.type === 'assistant') {
        this.engine.commit('assistant-message', formatAssistantMessage(item.content));
      }
    }

    this.engine.mount(this.streamingView);
    this.engine.mount(this.promptInput, { keepCursorVisible: true, kind: 'input' });
    this.engine.mount(this.statusBar);
  }

  private openSessionMenu(sessions: SessionData[]): void {
    if (this.activeModal) this.closeModal();
    this.engine.unmount(this.promptInput);
    this.engine.unmount(this.statusBar);

    const menu = new SessionMenu({
      sessions,
      onSelect: (selected) => {
        this.closeModal();
        this.switchToSession(selected);
      },
      onCancel: () => this.closeModal(),
    });

    this.activeModal = menu;
    this.engine.mount(menu, { kind: 'dock' });
    this.engine.mount(this.statusBar);
  }

  private requestConfirmation(request: ConfirmationRequest): Promise<ConfirmationDecision> {
    return new Promise<ConfirmationDecision>((resolve) => {
      this.engine.unmount(this.promptInput);
      this.engine.unmount(this.statusBar);

      const dock = new PermissionDock({
        request,
        onDecision: (decision) => {
          this.engine.unmount(dock);
          this.engine.unmount(this.statusBar);
          this.activeModal = null;
          this.engine.mount(this.promptInput, { keepCursorVisible: true, kind: 'input' });
          this.engine.mount(this.statusBar);
          resolve(decision);
        },
      });

      this.activeModal = dock;
      this.engine.mount(dock, { kind: 'dock' });
      this.engine.mount(this.statusBar);
    });
  }

  private handleAbort(): void {
    if (this.isBusy) {
      this.session.abort();
    }
  }

  private async handleSubmit(text: string, isBash = false): Promise<void> {
    // 1. Bash execution (!)
    if (isBash) {
      this.engine.commitPrompt(text, true);
      this.setBusy(true);

      try {
        const result = await executeShellCommand({
          command: text,
          cwd: this.cwd,
          onLine: (_line, recent) => {
            this.streamingView.setStream('', recent.join('\n'), true);
          },
        });
        this.streamingView.reset();

        const raw = result.output || result.stdout || result.stderr || '';
        const output = raw.trim() || '(no content)';
        this.engine.commit('assistant-message', formatAssistantMessage(output));
      } catch (err) {
        this.streamingView.reset();
        const structured = classifyError(err);
        this.engine.commit('system', formatErrorBadge(structured));
      } finally {
        this.setBusy(false);
      }
      return;
    }

    // 2. Slash command execution (/)
    if (defaultCommandRegistry.isCommand(text)) {
      const cmdResult = await defaultCommandRegistry.execute(text, {
        session: this.session,
        cwd: this.cwd,
      });

      if (cmdResult.data?.clearHistory) {
        this.engine.clearAll();
        this.engine.commit('header', this.header.render());
        this.engine.mount(this.streamingView);
        this.engine.mount(this.promptInput, { keepCursorVisible: true, kind: 'input' });
        this.engine.mount(this.statusBar);
        return;
      }

      if (cmdResult.data?.exit) {
        this.exit();
        return;
      }

      this.engine.commitPrompt(text);

      if (cmdResult.data?.showModelPicker) {
        this.openModelPicker(cmdResult.data.models ?? []);
        return;
      }

      if (cmdResult.data?.resumeDirect) {
        this.switchToSession(cmdResult.data.resumeDirect);
        return;
      }

      if (cmdResult.data?.showResume) {
        const summaries = listSessions();
        const loadedSessions = summaries
          .map((s) => loadSession(s.id))
          .filter((s): s is NonNullable<typeof s> => s !== null);
        this.openSessionMenu(cmdResult.data.sessions ?? loadedSessions);
        return;
      }

      if (cmdResult.message) {
        this.engine.commit('system', formatSystemMessage(cmdResult.message));
      }
      return;
    }

    // 3. Submit user prompt to AgentSession
    this.engine.commitPrompt(text);
    this.setBusy(true);

    const turnStartTime = performance.now();
    let accumulatedReasoning = '';
    let accumulatedText = '';
    const activeToolStartTimes = new Map<string, number>();

    const toolContext: ToolContext = {
      cwd: this.cwd,
      requestConfirmation: (req) => this.requestConfirmation(req),
      sessionAllowlist: this.sessionAllowlist,
      onToolProgress: (_chunk, recentLines) => {
        this.streamingView.updateToolOutput(recentLines);
      },
    };

    const tools = defaultToolCatalog.toAISDKTools(toolContext);

    try {
      await this.session.submitPrompt(text, {
        tools,
        onEvent: (event) => {
          switch (event.type) {
            case 'reasoning-delta': {
              accumulatedReasoning += event.reasoning;
              this.streamingView.setStream(accumulatedReasoning, accumulatedText, true);
              break;
            }
            case 'text-delta': {
              accumulatedText += event.text;
              this.streamingView.setStream(accumulatedReasoning, accumulatedText, true);
              break;
            }
            case 'tool-call': {
              // Flush any prior accumulated assistant text or thinking before tool execution log
              if (accumulatedText.trim() || accumulatedReasoning.trim()) {
                this.engine.commit(
                  'assistant-message',
                  formatAssistantMessage(accumulatedText, accumulatedReasoning),
                );
                accumulatedText = '';
                accumulatedReasoning = '';
                this.streamingView.reset();
              }

              activeToolStartTimes.set(event.toolCall.id, performance.now());
              // Set live active tool indicator in StreamingView with pulsing white bullet
              this.streamingView.setActiveTool({
                id: event.toolCall.id,
                name: event.toolCall.name,
                args: event.toolCall.args,
                startTime: performance.now(),
              });
              break;
            }
            case 'tool-result': {
              this.streamingView.setActiveTool(null);
              const start = activeToolStartTimes.get(event.toolResult.id);
              const durationMs = start ? Math.round(performance.now() - start) : undefined;
              activeToolStartTimes.delete(event.toolResult.id);

              const toolDef = defaultToolCatalog.get(event.toolResult.name);
              const outputSummary = formatToolOutputSummary(
                event.toolResult.result,
                event.toolResult.isError,
              );

              const resObj =
                typeof event.toolResult.result === 'object' && event.toolResult.result !== null
                  ? (event.toolResult.result as any)
                  : undefined;

              const isMutatingTool =
                event.toolResult.name === 'edit_file' ||
                event.toolResult.name === 'write_file' ||
                event.toolResult.name === 'run_command';

              let previewLines: string[] | undefined = undefined;
              let totalLines: number | undefined = undefined;

              if (isMutatingTool) {
                if (Array.isArray(resObj?.previewLines)) {
                  previewLines = resObj.previewLines;
                  totalLines = resObj?.totalLines ?? previewLines.length;
                } else if (resObj?.stdout || resObj?.stderr) {
                  const combined = [resObj.stdout, resObj.stderr].filter(Boolean).join('\n').trim();
                  if (combined) {
                    previewLines = combined.split(/\r?\n/);
                    totalLines = previewLines.length;
                  }
                }
              }

              this.engine.commit(
                'tool-result',
                formatToolStatus({
                  toolName: event.toolResult.name,
                  displayName: toolDef?.displayName,
                  icon: toolDef?.icon,
                  argsSummary: JSON.stringify(event.toolResult.args),
                  status: event.toolResult.isError ? 'failed' : 'completed',
                  durationMs,
                  error: event.toolResult.isError
                    ? typeof event.toolResult.result === 'object' &&
                      event.toolResult.result !== null
                      ? ((event.toolResult.result as any).message ??
                        JSON.stringify(event.toolResult.result))
                      : String(event.toolResult.result)
                    : undefined,
                  toolOutput: outputSummary,
                  previewLines,
                  diffLines: Array.isArray(resObj?.diffLines) ? resObj.diffLines : undefined,
                  highlightLineIndex: resObj?.highlightLineIndex,
                  highlightCount: resObj?.highlightCount,
                  totalLines: resObj?.totalLines,
                }),
              );
              break;
            }
            case 'turn-complete': {
              this.streamingView.setActiveTool(null);
              if (accumulatedText.trim() || accumulatedReasoning.trim()) {
                this.engine.commit(
                  'assistant-message',
                  formatAssistantMessage(accumulatedText, accumulatedReasoning),
                );
              }
              accumulatedText = '';
              accumulatedReasoning = '';
              this.streamingView.reset();

              // Commit turn finished badge with leading empty line (e.g. * Baked for 20s · done 7:31 AM)
              const totalDurationMs = Math.round(performance.now() - turnStartTime);
              this.engine.commit('system', ['', formatTurnStatus(totalDurationMs)]);

              this.statusBar.update({
                usage: this.session.session.totalUsage,
              });

              if (event.summary.stopReason === 'step-limit') {
                this.engine.commit(
                  'system',
                  formatSystemMessage('Step budget reached. Generation stopped early.'),
                );
              }
              break;
            }
            case 'error': {
              const structured = classifyError(event.error);
              this.engine.commit('system', formatErrorBadge(structured));
              break;
            }
          }
        },
      });
    } catch (err: any) {
      this.streamingView.setActiveTool(null);
      const structured = classifyError(err);
      if (structured.category === 'aborted') {
        if (accumulatedText.trim() || accumulatedReasoning.trim()) {
          this.engine.commit(
            'assistant-message',
            formatAssistantMessage(accumulatedText, accumulatedReasoning),
          );
        }
        accumulatedText = '';
        accumulatedReasoning = '';
        this.streamingView.reset();
        this.engine.commit('system', formatErrorBadge(structured));
      } else {
        this.engine.commit('system', formatErrorBadge(structured));
      }
    } finally {
      this.setBusy(false);
      this.statusBar.update({
        usage: this.session.session.totalUsage,
      });
    }
  }

  private setBusy(busy: boolean): void {
    this.isBusy = busy;
    this.promptInput.setDisabled(busy);
    this.statusBar.update({ isBusy: busy });
  }

  private exit(): void {
    this.engine.cleanupSync();
    if (this.onExitCallback) {
      this.onExitCallback();
    } else {
      process.exit(0);
    }
  }
}
