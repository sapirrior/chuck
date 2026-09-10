import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, useApp, useInput } from 'ink';
import { AgentSession } from '../agent/agent-session.js';
import type { AgentEvent } from '../agent/events.js';
import { defaultCommandRegistry } from '../commands/registry.js';
import { defaultToolCatalog } from '../tools/catalog.js';
import type { ConfirmationDecision, ConfirmationRequest, ToolContext } from '../tools/types.js';
import { Header } from './components/header.js';
import { MessageHistory, type UIHistoryItem } from './components/message-history.js';
import { PromptInput } from './components/prompt-input.js';
import { ConfirmationModal } from './components/confirmation-modal.js';
import { StatusBar } from './components/status-bar.js';

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
  const [activeConfirmation, setActiveConfirmation] = useState<{
    request: ConfirmationRequest;
    resolver: (decision: ConfirmationDecision) => void;
  } | null>(null);

  const sessionAllowlistRef = useRef<Set<string>>(new Set());

  // Handle Ctrl+C to abort current operation or exit
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (isBusy) {
        session.abort();
      } else {
        exit();
      }
    }
  });

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

  const handleSubmit = async (text: string) => {
    // 1. Check if slash command
    if (defaultCommandRegistry.isCommand(text)) {
      setHistoryItems((prev) => [
        ...prev,
        { id: `cmd-in-${Date.now()}`, type: 'user', content: text },
      ]);

      const cmdResult = await defaultCommandRegistry.execute(text, { session, cwd });
      if (cmdResult.message) {
        setHistoryItems((prev) => [
          ...prev,
          { id: `cmd-out-${Date.now()}`, type: 'system', content: cmdResult.message! },
        ]);
      }
      return;
    }

    // 2. Submit user prompt to AgentSession
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
                    return {
                      ...item,
                      toolData: {
                        ...item.toolData,
                        status: event.toolResult.isError ? 'failed' : 'completed',
                        error: event.toolResult.isError
                          ? String(event.toolResult.result)
                          : undefined,
                      },
                    };
                  }
                  return item;
                }),
              );
              break;

            case 'turn-complete':
              // Commit stream into history item
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

      {activeConfirmation ? (
        <ConfirmationModal
          request={activeConfirmation.request}
          onDecision={handleConfirmationDecision}
        />
      ) : (
        <PromptInput onSubmit={handleSubmit} disabled={isBusy} />
      )}

      <StatusBar model={currentModel} usage={usage} isBusy={isBusy} />
    </Box>
  );
};
