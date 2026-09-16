import TerminalEngine from './engine/TerminalEngine.js';
import { AgentSession } from '../engine/agent-session.js';
import { defaultCommandRegistry } from '../commands/registry.js';
import { defaultToolCatalog } from '../tools/index.js';
import type { ToolContext } from '../tools/types.js';
import type { ModelDescriptor } from '../models/index.js';
import type { SessionData } from '../session/types.js';
import { listSessions, loadSession, rehydrateSessionHistory } from '../session/index.js';
import { saveSettings, isFolderTrusted, trustFolder } from '../config/index.js';
import Header from './components/Header.js';
import StatusBar from './components/StatusBar.js';
import StreamingView from './components/StreamingView.js';
import PromptInput from './components/PromptInput.js';
import TrustGate from './components/TrustGate.js';
import ModelPicker from './components/docks/ModelPicker.js';
import SessionMenu from './components/docks/SessionMenu.js';
import ShortcutsMenu from './components/docks/ShortcutsMenu.js';
import EffortPicker from './components/docks/EffortPicker.js';
import {
  formatSystemMessage,
  formatAssistantMessage,
  formatToolStatus,
  formatErrorBadge,
  formatTurnStatus,
} from './utils/message-formatter.js';
import { classifyError } from '../errors/index.js';

export interface TUIAppOptions {
  version?: string;
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

  private activeModal: ModelPicker | SessionMenu | ShortcutsMenu | EffortPicker | null = null;
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
      version: options.version,
      cwd: this.cwd,
      model,
    });

    this.streamingView = new StreamingView();

    this.promptInput = new PromptInput({
      onSubmit: (text) => this.handleSubmit(text),
      onAbort: () => this.handleAbort(),
      onToggleHelp: () => this.toggleHelp(),
      cwd: this.cwd,
      initialHistory: this.session.session.turns
        .map((t) => {
          const userMsg = t.messages.find((m) => m.role === 'user');
          if (!userMsg) return '';
          return typeof userMsg.content === 'string'
            ? userMsg.content
            : Array.isArray(userMsg.content)
              ? userMsg.content
                  .filter((p: any) => p.type === 'text')
                  .map((p: any) => p.text)
                  .join(' ')
              : '';
        })
        .filter((p): p is string => Boolean(p && p.trim())),
    });

    this.statusBar = new StatusBar({
      model,
      usage: this.session.session.totalUsage,
      isBusy: false,
    });
  }

  public async start(): Promise<void> {
    if (isFolderTrusted(this.cwd)) {
      this.proceedStart();
      return;
    }

    this.engine.ensureAlternateScreen();
    const trustGate = new TrustGate({
      cwd: this.cwd,
      onDecision: (trusted) => {
        if (trusted) {
          trustFolder(this.cwd);
          this.engine.unmount(trustGate);
          this.proceedStart();
        } else {
          this.exit();
        }
      },
    });

    this.engine.mount(trustGate, { kind: 'custom' });
  }

  private proceedStart(): void {
    this.engine.ensureAlternateScreen();

    // Commit Header at the top of history
    this.engine.commit('header', this.header.render());

    // Rehydrate previous session turns if any
    const turns = this.session.session.turns;
    if (turns.length > 0) {
      for (const turn of turns) {
        for (const msg of turn.messages) {
          if (msg.role === 'user') {
            const promptText =
              typeof msg.content === 'string'
                ? msg.content
                : Array.isArray(msg.content)
                  ? msg.content
                      .filter((p: any) => p.type === 'text')
                      .map((p: any) => p.text)
                      .join('\n')
                  : '';
            if (promptText) {
              this.engine.commitPrompt(promptText);
            }
          } else if (msg.role === 'assistant') {
            if (typeof msg.content === 'string' && msg.content) {
              this.engine.commit('assistant-message', formatAssistantMessage(msg.content), {
                hangingIndent: 2,
              });
            } else if (Array.isArray(msg.content)) {
              for (const part of msg.content) {
                if (part.type === 'text' && part.text) {
                  this.engine.commit('assistant-message', formatAssistantMessage(part.text), {
                    hangingIndent: 2,
                  });
                } else if (part.type === 'tool-call') {
                  this.engine.commit(
                    'tool-result',
                    (w) =>
                      formatToolStatus({
                        toolName: part.toolName,
                        argsSummary: JSON.stringify(part.args ?? {}),
                        status: 'completed',
                        targetWidth: w,
                      }),
                    { hangingIndent: 2 },
                  );
                }
              }
            }
          }
        }
      }
    }

    // Mount live interactive components at the bottom
    this.engine.mount(this.streamingView, { kind: 'custom' });
    this.engine.mount(this.promptInput, { keepCursorVisible: true, kind: 'input' });
    this.engine.mount(this.statusBar, { kind: 'custom' });

    // Handle global keybindings
    this.engine.addInputListener((chunk) => {
      const str = chunk.toString();

      // Ctrl+C double-tap handling
      if (str === '\x03') {
        if (this.ctrlCPending) {
          if (this.ctrlCTimer) clearTimeout(this.ctrlCTimer);
          this.ctrlCPending = false;
          this.exit();
          return true;
        }

        this.ctrlCPending = true;
        this.statusBar.update({ exitPending: true });
        this.ctrlCTimer = setTimeout(() => {
          this.ctrlCPending = false;
          this.statusBar.update({ exitPending: false });
        }, 1500);
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
    if (this.activeModal instanceof ShortcutsMenu) {
      this.closeModal();
      return;
    }
    this.openHelp();
  }

  private openHelp(): void {
    if (this.activeModal) this.closeModal();
    this.engine.unmount(this.promptInput);
    this.engine.unmount(this.statusBar);

    const help = new ShortcutsMenu({
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
        const updated = this.session.setModel({
          provider: selected.provider,
          modelId: selected.model_id,
        });
        saveSettings({
          model: {
            provider: updated.provider,
            modelId: updated.modelId,
            effort: updated.effort,
          },
        });
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
      } else if (item.type === 'system') {
        this.engine.commit('system', formatSystemMessage(item.content));
      } else if (item.type === 'tool' && item.toolData) {
        const toolData = item.toolData;
        this.engine.commit(
          'tool-result',
          (w) =>
            formatToolStatus({
              toolName: toolData.toolName,
              displayName: toolData.displayName,
              icon: toolData.icon,
              argsSummary: toolData.argsSummary,
              status: toolData.status,
              durationMs: toolData.durationMs,
              error: toolData.error,
              toolOutput: toolData.toolOutput,
              targetWidth: w,
            }),
          { hangingIndent: 2 },
        );
      } else if (item.type === 'assistant') {
        this.engine.commit('assistant-message', formatAssistantMessage(item.content), {
          hangingIndent: 2,
        });
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

  private openEffortPicker(): void {
    if (this.activeModal) this.closeModal();
    this.engine.unmount(this.promptInput);
    this.engine.unmount(this.statusBar);

    const currentEffort = this.session.getEffort();
    const picker = new EffortPicker({
      currentEffort,
      onSelect: (selected, persist) => {
        this.session.setEffort(selected, persist);
        const updatedModel = this.session.getModel();
        this.header.props.model = updatedModel;
        this.statusBar.update({ model: updatedModel });
        const scope = persist ? 'saved globally to settings' : 'for this session only';
        this.engine.commit(
          'system',
          formatSystemMessage(`Reasoning effort set to "${selected}" (${scope})`),
        );
        this.closeModal();
      },
      onCancel: () => this.closeModal(),
    });

    this.activeModal = picker;
    this.engine.mount(picker, { kind: 'dock' });
    this.engine.mount(this.statusBar);
  }

  private handleAbort(): void {
    if (this.isBusy) {
      this.session.abort();
    }
  }

  private async handleSubmit(text: string): Promise<void> {
    // 1. Slash command execution (/)
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

      if (cmdResult.data?.showEffortPicker) {
        this.openEffortPicker();
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

      const updatedModel = this.session.getModel();
      this.header.props.model = updatedModel;
      this.statusBar.update({
        model: updatedModel,
        usage: this.session.session.totalUsage,
      });
      return;
    }

    // 2. Submit user prompt to AgentSession
    this.engine.commitPrompt(text);
    this.setBusy(true);

    const turnStartTime = performance.now();
    let accumulatedText = '';
    const activeToolStartTimes = new Map<string, number>();

    const toolContext: ToolContext = {
      cwd: this.cwd,
    };

    const tools = defaultToolCatalog.toAISDKTools(toolContext);

    try {
      await this.session.submitPrompt(text, {
        tools,
        onEvent: (event) => {
          switch (event.type) {
            case 'reasoning-delta': {
              // Internal model reasoning is saved to session messages but not rendered to the TUI
              break;
            }
            case 'text-delta': {
              accumulatedText += event.text;
              this.streamingView.setStream(accumulatedText, true);
              break;
            }
            case 'tool-call': {
              // Flush any prior accumulated assistant text before tool execution log
              if (accumulatedText.trim()) {
                this.engine.commit('assistant-message', formatAssistantMessage(accumulatedText), {
                  hangingIndent: 2,
                });
                accumulatedText = '';
                this.streamingView.reset();
              }

              activeToolStartTimes.set(event.toolCall.id, performance.now());
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

              const toolName = event.toolResult.name;
              const displayName = toolDef?.displayName;
              const icon = toolDef?.icon;
              const argsSummary = JSON.stringify(event.toolResult.args);
              const status = event.toolResult.isError ? 'failed' : 'completed';
              const error = event.toolResult.isError
                ? typeof event.toolResult.result === 'object' && event.toolResult.result !== null
                  ? ((event.toolResult.result as any).message ??
                    JSON.stringify(event.toolResult.result))
                  : String(event.toolResult.result)
                : undefined;

              this.engine.commit(
                'tool-result',
                (w) =>
                  formatToolStatus({
                    toolName,
                    displayName,
                    icon,
                    argsSummary,
                    status,
                    durationMs,
                    error,
                    targetWidth: w,
                  }),
                { hangingIndent: 2 },
              );
              break;
            }
            case 'turn-complete': {
              this.streamingView.setActiveTool(null);
              if (accumulatedText.trim()) {
                this.engine.commit('assistant-message', formatAssistantMessage(accumulatedText), {
                  hangingIndent: 2,
                });
              }
              accumulatedText = '';
              this.streamingView.reset();

              // Commit turn finished badge with leading empty line
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
        if (accumulatedText.trim()) {
          this.engine.commit('assistant-message', formatAssistantMessage(accumulatedText), {
            hangingIndent: 2,
          });
        }
        accumulatedText = '';
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
