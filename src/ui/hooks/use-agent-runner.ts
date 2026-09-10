import { useState, useRef, useCallback } from 'react';
import { randomUUID } from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { AgentSession } from '../../agent/agent-session.js';
import type { AgentEvent } from '../../agent/events.js';
import { defaultCommandRegistry } from '../../commands/registry.js';
import { defaultToolCatalog } from '../../tools/index.js';
import type { ConfirmationDecision, ConfirmationRequest, ToolContext } from '../../tools/types.js';
import type { ModelDescriptor } from '../../models/index.js';
import type { SessionData } from '../../session/types.js';
import { listSessions, loadSession } from '../../session/index.js';
import { saveSettings } from '../../config/index.js';
import type { UIHistoryItem } from '../components/message-history.js';
import { formatToolOutputSummary, rehydrateSessionHistory } from '../utils/history-helpers.js';

const execAsync = promisify(exec);

export interface UseAgentRunnerOptions {
  initialSession?: AgentSession;
  cwd?: string;
  onExit?: () => void;
}

export function useAgentRunner({
  initialSession,
  cwd = process.cwd(),
  onExit,
}: UseAgentRunnerOptions = {}) {
  const [session, setSession] = useState<AgentSession>(() => initialSession ?? new AgentSession());
  const [historyItems, setHistoryItems] = useState<UIHistoryItem[]>([]);
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
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

  const requestConfirmation = useCallback((request: ConfirmationRequest) => {
    return new Promise<ConfirmationDecision>((resolve) => {
      setActiveConfirmation({
        request,
        resolver: resolve,
      });
    });
  }, []);

  const handleSelectResumeSession = useCallback((selected: SessionData) => {
    const resumed = AgentSession.resume(selected);
    setSession(resumed);
    setSessionVersion((v) => v + 1);
    setShowResume(false);
    setHistoryItems(rehydrateSessionHistory(selected));
  }, []);

  const handleSelectModel = useCallback(
    (selected: ModelDescriptor) => {
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
          id: `sys-model-${randomUUID()}`,
          type: 'system',
          content: `Active model switched to ${selected.provider}/${selected.model_id}`,
        },
      ]);
    },
    [session],
  );

  const handleSubmit = useCallback(
    async (text: string, isBash = false) => {
      // 1. Direct Bash Mode execution (!)
      if (isBash) {
        setHistoryItems((prev) => [
          ...prev,
          { id: `bash-${randomUUID()}`, type: 'bash', content: text },
        ]);
        setIsBusy(true);

        try {
          const { stdout, stderr } = await execAsync(text, { cwd, maxBuffer: 10 * 1024 * 1024 });
          const raw = stdout || stderr || '';
          const output = raw.trim() || '(no content)';
          setHistoryItems((prev) => [
            ...prev,
            { id: `bash-out-${randomUUID()}`, type: 'assistant', content: output },
          ]);
        } catch (err) {
          setHistoryItems((prev) => [
            ...prev,
            {
              id: `bash-err-${randomUUID()}`,
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

        // If /exit executed, trigger exit
        if (cmdResult.data?.exit) {
          if (onExit) {
            onExit();
          } else {
            process.exit(0);
          }
          return;
        }

        setHistoryItems((prev) => [
          ...prev,
          { id: `cmd-in-${randomUUID()}`, type: 'user', content: text },
        ]);

        if (cmdResult.data?.showModelPicker) {
          setAvailableModels(cmdResult.data.models ?? []);
          setShowModelPicker(true);
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
            { id: `cmd-out-${randomUUID()}`, type: 'system', content: cmdResult.message! },
          ]);
        }
        return;
      }

      // 3. Submit user prompt to AgentSession
      setHistoryItems((prev) => [
        ...prev,
        { id: `u-${randomUUID()}`, type: 'user', content: text },
      ]);

      setIsBusy(true);
      setStreamingReasoning('');
      setStreamingText('');

      const toolContext: ToolContext = {
        cwd,
        sessionAllowlist: sessionAllowlistRef.current,
        requestConfirmation,
        onDeny: () => {
          session.abort();
        },
      };

      const tools = defaultToolCatalog.toAISDKTools(toolContext);

      let currentStreamText = '';
      let currentStreamReasoning = '';
      let errorHandled = false;

      try {
        await session.submitPrompt(text, {
          tools,
          onEvent: (event: AgentEvent) => {
            switch (event.type) {
              case 'text-delta':
                currentStreamText += event.text;
                setStreamingText(currentStreamText);
                break;

              case 'reasoning-delta':
                currentStreamReasoning += event.reasoning;
                setStreamingReasoning(currentStreamReasoning);
                break;

              case 'tool-call': {
                const itemsToFlush: UIHistoryItem[] = [];
                if (currentStreamReasoning) {
                  itemsToFlush.push({
                    id: `res-reasoning-${randomUUID()}`,
                    type: 'reasoning',
                    content: currentStreamReasoning,
                  });
                  currentStreamReasoning = '';
                  setStreamingReasoning('');
                }
                if (currentStreamText) {
                  itemsToFlush.push({
                    id: `res-text-${randomUUID()}`,
                    type: 'assistant',
                    content: currentStreamText,
                  });
                  currentStreamText = '';
                  setStreamingText('');
                }
                itemsToFlush.push({
                  id: `tool-${event.toolCall.id}`,
                  type: 'tool',
                  content: '',
                  toolData: {
                    toolName: event.toolCall.name,
                    argsSummary: JSON.stringify(event.toolCall.args),
                    status: 'running',
                  },
                });

                setHistoryItems((prev) => [...prev, ...itemsToFlush]);
                break;
              }

              case 'tool-result':
                setHistoryItems((prev) =>
                  prev.map((item) => {
                    if (item.id === `tool-${event.toolResult.id}` && item.toolData) {
                      return {
                        ...item,
                        toolData: {
                          ...item.toolData,
                          status: event.toolResult.isError ? 'failed' : 'completed',
                          error: event.toolResult.isError
                            ? String(event.toolResult.result)
                            : undefined,
                          toolOutput: formatToolOutputSummary(
                            event.toolResult.result,
                            event.toolResult.isError,
                          ),
                        },
                      };
                    }
                    return item;
                  }),
                );
                break;

              case 'turn-complete': {
                const finalItems: UIHistoryItem[] = [];
                if (currentStreamReasoning) {
                  finalItems.push({
                    id: `res-reasoning-${randomUUID()}`,
                    type: 'reasoning',
                    content: currentStreamReasoning,
                  });
                  currentStreamReasoning = '';
                }
                if (currentStreamText) {
                  finalItems.push({
                    id: `res-text-${randomUUID()}`,
                    type: 'assistant',
                    content: currentStreamText,
                  });
                  currentStreamText = '';
                }
                if (finalItems.length > 0) {
                  setHistoryItems((prev) => [...prev, ...finalItems]);
                }
                setStreamingReasoning('');
                setStreamingText('');
                setSessionVersion((v) => v + 1);
                break;
              }

              case 'error': {
                errorHandled = true;
                const msg = event.error.message;
                if (
                  !msg.toLowerCase().includes('interrupted') &&
                  !msg.toLowerCase().includes('cancelled')
                ) {
                  setHistoryItems((prev) => [
                    ...prev,
                    {
                      id: `err-${randomUUID()}`,
                      type: 'system',
                      content: `Error: ${event.error.message}`,
                    },
                  ]);
                }
                break;
              }
            }
          },
        });
      } catch (err) {
        if (!errorHandled) {
          const msg = err instanceof Error ? err.message : String(err);
          if (
            !msg.toLowerCase().includes('interrupted') &&
            !msg.toLowerCase().includes('cancelled')
          ) {
            setHistoryItems((prev) => [
              ...prev,
              {
                id: `err-${randomUUID()}`,
                type: 'system',
                content: `Execution error: ${msg}`,
              },
            ]);
          }
        }
      } finally {
        setIsBusy(false);
        setStreamingReasoning('');
        setStreamingText('');
        setSessionVersion((v) => v + 1);
      }
    },
    [cwd, requestConfirmation, session],
  );

  return {
    session,
    currentModel: session.getModel(),
    usage: session.getUsage(),
    historyItems,
    streamingReasoning,
    streamingText,
    isBusy,
    sessionVersion,
    showHelp,
    setShowHelp,
    showResume,
    setShowResume,
    showModelPicker,
    setShowModelPicker,
    availableModels,
    availableSessions,
    activeConfirmation,
    handleAbort,
    handleConfirmationDecision,
    handleSelectResumeSession,
    handleSelectModel,
    handleSubmit,
  };
}
