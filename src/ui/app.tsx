import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, useApp, useInput } from 'ink';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { AgentSession } from '../agent/agent-session.js';
import type { AgentEvent } from '../agent/events.js';
import { defaultCommandRegistry } from '../commands/registry.js';
import { defaultToolCatalog } from '../tools/index.js';
import type { ConfirmationDecision, ConfirmationRequest, ToolContext } from '../tools/types.js';
import type { ModelDescriptor } from '../models/index.js';
import type { SessionData } from '../session/types.js';
import { listSessions, loadSession } from '../session/index.js';
import { saveSettings } from '../config/index.js';
import { useDoublePress } from './hooks/use-double-press.js';
import { Header } from './components/header.js';
import { MessageHistory, type UIHistoryItem } from './components/message-history.js';
import { PromptInput } from './components/prompt-input.js';
import { StatusBar } from './components/status-bar.js';
import { PermissionDock } from './components/docks/permission-dock.js';
import { HelpMenu } from './components/docks/help-menu.js';
import { SessionMenu } from './components/docks/session-menu.js';
import { ModelPicker } from './components/docks/model-picker.js';

const execAsync = promisify(exec);

export interface AppProps {
  session?: AgentSession;
  cwd?: string;
}

export const App: React.FC<AppProps> = ({ session: initialSession, cwd = process.cwd() }) => {
  const { exit } = useApp();
  const [session, setSession] = useState<AgentSession>(() => initialSession ?? new AgentSession());
  const [historyItems, setHistoryItems] = useState<UIHistoryItem[]>([]);
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [exitPending, setExitPending] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);

  // Active dock modal states
  const [showHelp, setShowHelp] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelDescriptor[]>([]);
  const [availableSessions, setAvailableSessions] = useState<SessionData[]>([]);

  const [activeConfirmation, setActiveConfirmation] = useState<{
    request: ConfirmationRequest;
    resolver: (decision: ConfirmationDecision) => void;
  } | null>(null);

  const sessionAllowlistRef = useRef<Set<string>>(new Set());

  // Double-press Ctrl+C to exit Claude Code 1:1 behavior
  const handleCtrlCDoublePress = useDoublePress(
    (pending) => setExitPending(pending),
    () => {
      exit();
    },
  );

  // Global Keybindings: Ctrl+C and Escape
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (isBusy) {
        session.abort();
      } else {
        handleCtrlCDoublePress();
      }
    }
  });

  const handleAbort = useCallback(() => {
    if (isBusy) {
      session.abort();
    }
  }, [isBusy, session]);

  const handleConfirmationDecision = useCallback(
    (decision: ConfirmationDecision) => {
      if (activeConfirmation) {
        activeConfirmation.resolver(decision);
        setActiveConfirmation(null);
      }
    },
    [activeConfirmation],
  );

  const requestConfirmation = useCallback(
    (request: ConfirmationRequest): Promise<ConfirmationDecision> => {
      return new Promise<ConfirmationDecision>((resolve) => {
        setActiveConfirmation({
          request,
          resolver: resolve,
        });
      });
    },
    [],
  );

  const handleSelectResumeSession = (selected: SessionData) => {
    const resumed = AgentSession.resume(selected);
    setSession(resumed);
    setSessionVersion((v) => v + 1);
    setShowResume(false);

    // Rehydrate full conversational transcript and tool calls from restored session
    const restoredItems: UIHistoryItem[] = [];
    for (const turn of selected.turns) {
      if (turn.userPrompt) {
        restoredItems.push({
          id: `u-${turn.id}`,
          type: 'user',
          content: turn.userPrompt,
        });
      }
      if (turn.toolCalls && turn.toolCalls.length > 0) {
        for (const tc of turn.toolCalls) {
          restoredItems.push({
            id: `tool-${tc.id}`,
            type: 'tool',
            content: '',
            toolData: {
              toolName: tc.name,
              argsSummary: JSON.stringify(tc.args),
              status: tc.isError ? 'failed' : 'completed',
              error: tc.isError ? String(tc.result) : undefined,
            },
          });
        }
      }
      if (turn.reasoning) {
        restoredItems.push({
          id: `res-reasoning-${turn.id}`,
          type: 'reasoning',
          content: turn.reasoning,
        });
      }
      if (turn.assistantText) {
        restoredItems.push({
          id: `res-text-${turn.id}`,
          type: 'assistant',
          content: turn.assistantText,
        });
      }
    }

    restoredItems.push({
      id: `sys-resume-${Date.now()}`,
      type: 'system',
      content: `Resumed session ${selected.id.slice(0, 8)} (${selected.turns.length} turns, ${selected.totalUsage?.totalTokens ?? 0} tokens)`,
    });

    setHistoryItems(restoredItems);
  };

  const handleSelectModel = (selected: ModelDescriptor) => {
    session.setModel({
      provider: selected.provider,
      modelId: selected.model_id,
    });
    saveSettings({
      model: {
        provider: selected.provider,
        modelId: selected.model_id,
      },
    });
    setSessionVersion((v) => v + 1);
    setShowModelPicker(false);
    setHistoryItems((prev) => [
      ...prev,
      {
        id: `sys-model-${Date.now()}`,
        type: 'system',
        content: `Active model switched to ${selected.provider}/${selected.model_id}`,
      },
    ]);
  };

  const handleSubmit = async (text: string, isBash = false) => {
    // 1. Direct Bash Mode execution (!)
    if (isBash) {
      setHistoryItems((prev) => [
        ...prev,
        { id: `bash-${Date.now()}`, type: 'bash', content: text },
      ]);
      setIsBusy(true);

      try {
        const { stdout, stderr } = await execAsync(text, { cwd, maxBuffer: 10 * 1024 * 1024 });
        const output = stdout || stderr || '(executed with no output)';
        setHistoryItems((prev) => [
          ...prev,
          { id: `bash-out-${Date.now()}`, type: 'assistant', content: output.trim() },
        ]);
      } catch (err) {
        setHistoryItems((prev) => [
          ...prev,
          {
            id: `bash-err-${Date.now()}`,
            type: 'system',
            content: `Command error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ]);
      } finally {
        setIsBusy(false);
      }
      return;
    }

    // 2. Slash command execution (/)
    if (defaultCommandRegistry.isCommand(text)) {
      const cmdResult = await defaultCommandRegistry.execute(text, { session, cwd });

      // If /clear executed, wipe UI history items immediately
      if (cmdResult.data?.clearHistory) {
        setHistoryItems([]);
        setSessionVersion((v) => v + 1);
        return;
      }

      setHistoryItems((prev) => [
        ...prev,
        { id: `cmd-in-${Date.now()}`, type: 'user', content: text },
      ]);

      if (cmdResult.data?.showModelPicker) {
        setAvailableModels(cmdResult.data.models ?? []);
        setShowModelPicker(true);
        return;
      }

      if (cmdResult.data?.showHelp) {
        setShowHelp(true);
        return;
      }

      if (cmdResult.data?.showResume) {
        const summaries = listSessions();
        const loadedSessions = summaries
          .map((s) => loadSession(s.id))
          .filter((s): s is NonNullable<typeof s> => s !== null);
        setAvailableSessions(cmdResult.data.sessions ?? loadedSessions);
        setShowResume(true);
        return;
      }

      if (cmdResult.message) {
        setHistoryItems((prev) => [
          ...prev,
          { id: `cmd-out-${Date.now()}`, type: 'system', content: cmdResult.message! },
        ]);
      }
      return;
    }

    // 3. Submit user prompt to AgentSession
    setHistoryItems((prev) => [...prev, { id: `u-${Date.now()}`, type: 'user', content: text }]);

    setIsBusy(true);
    setStreamingReasoning('');
    setStreamingText('');

    const toolContext: ToolContext = {
      cwd,
      sessionAllowlist: sessionAllowlistRef.current,
      requestConfirmation,
    };

    const tools = defaultToolCatalog.toAISDKTools(toolContext);

    try {
      await session.submitPrompt(text, {
        tools,
        onEvent: (event: AgentEvent) => {
          switch (event.type) {
            case 'text-delta':
              setStreamingText((prev) => prev + event.text);
              break;

            case 'reasoning-delta':
              setStreamingReasoning((prev) => prev + event.reasoning);
              break;

            case 'tool-call':
              setHistoryItems((prev) => [
                ...prev,
                {
                  id: `tool-${event.toolCall.id}`,
                  type: 'tool',
                  content: '',
                  toolData: {
                    toolName: event.toolCall.name,
                    argsSummary: JSON.stringify(event.toolCall.args),
                    status: 'running',
                  },
                },
              ]);
              break;

            case 'tool-result':
              setHistoryItems((prev) =>
                prev.map((item) => {
                  if (item.id === `tool-${event.toolResult.id}` && item.toolData) {
                    let outputSummary: string | undefined = undefined;
                    const res = event.toolResult.result;

                    if (event.toolResult.isError) {
                      outputSummary = undefined;
                    } else if (typeof res === 'object' && res !== null) {
                      const anyRes = res as any;
                      if (anyRes.message) {
                        outputSummary = anyRes.message;
                      } else if (anyRes.totalLines !== undefined) {
                        outputSummary = `Read ${anyRes.endLine - anyRes.startLine + 1} of ${anyRes.totalLines} lines`;
                      } else if (anyRes.url && anyRes.status) {
                        outputSummary = `Fetched ${anyRes.contentType} (${anyRes.status} OK, ${anyRes.content?.length ?? 0} chars)`;
                      } else if (anyRes.content) {
                        outputSummary = typeof anyRes.content === 'string' ? anyRes.content.split('\n')[0] : JSON.stringify(anyRes.content);
                      }
                    } else if (typeof res === 'string' && res.trim()) {
                      outputSummary = res.trim().split('\n')[0];
                    }

                    return {
                      ...item,
                      toolData: {
                        ...item.toolData,
                        status: event.toolResult.isError ? 'failed' : 'completed',
                        error: event.toolResult.isError ? String(event.toolResult.result) : undefined,
                        toolOutput: outputSummary,
                      },
                    };
                  }
                  return item;
                }),
              );
              break;

            case 'turn-complete':
              setHistoryItems((prev) => {
                const updated = [...prev];
                if (event.summary.reasoning) {
                  updated.push({
                    id: `res-reasoning-${Date.now()}`,
                    type: 'reasoning',
                    content: event.summary.reasoning,
                  });
                }
                if (event.summary.text) {
                  updated.push({
                    id: `res-text-${Date.now()}`,
                    type: 'assistant',
                    content: event.summary.text,
                  });
                }
                return updated;
              });
              setStreamingReasoning('');
              setStreamingText('');
              setSessionVersion((v) => v + 1);
              break;

            case 'error':
              setHistoryItems((prev) => [
                ...prev,
                {
                  id: `err-${Date.now()}`,
                  type: 'system',
                  content: `Error: ${event.error.message}`,
                },
              ]);
              break;
          }
        },
      });
    } catch (err) {
      setHistoryItems((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          type: 'system',
          content: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setIsBusy(false);
      setStreamingReasoning('');
      setStreamingText('');
      setSessionVersion((v) => v + 1);
    }
  };

  const currentModel = session.getModel();
  const usage = session.getUsage();

  return (
    <Box flexDirection="column" padding={1} width="100%">
      <Header cwd={cwd} model={currentModel} />

      <MessageHistory
        items={historyItems}
        streamingReasoning={streamingReasoning}
        streamingText={streamingText}
      />

      {/* Unified Bottom Dock Layer */}
      {activeConfirmation ? (
        <PermissionDock
          request={activeConfirmation.request}
          onDecision={handleConfirmationDecision}
        />
      ) : showModelPicker ? (
        <ModelPicker
          models={availableModels}
          currentModel={currentModel}
          onSelect={handleSelectModel}
          onCancel={() => setShowModelPicker(false)}
        />
      ) : showHelp ? (
        <HelpMenu onClose={() => setShowHelp(false)} />
      ) : showResume ? (
        <SessionMenu
          sessions={availableSessions}
          onSelect={handleSelectResumeSession}
          onCancel={() => setShowResume(false)}
        />
      ) : (
        <PromptInput
          onSubmit={handleSubmit}
          disabled={isBusy}
          onAbort={handleAbort}
          exitPending={exitPending}
          cwd={cwd}
          onToggleHelp={() => setShowHelp((prev) => !prev)}
        />
      )}

      <StatusBar
        key={sessionVersion}
        model={currentModel}
        usage={usage}
        isBusy={isBusy}
        exitPending={exitPending}
      />
    </Box>
  );
};
