import React, { useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import type { AgentSession } from '../agent/agent-session.js';
import { useDoublePress } from './hooks/use-double-press.js';
import { useAgentRunner } from './hooks/use-agent-runner.js';
import { Header } from './components/header.js';
import { MessageHistory } from './components/message-history.js';
import { PromptInput } from './components/prompt-input.js';
import { StatusBar } from './components/status-bar.js';
import { PermissionDock } from './components/docks/permission-dock.js';
import { HelpMenu } from './components/docks/help-menu.js';
import { SessionMenu } from './components/docks/session-menu.js';
import { ModelPicker } from './components/docks/model-picker.js';

export interface AppProps {
  session?: AgentSession;
  cwd?: string;
}

export const App: React.FC<AppProps> = ({ session: initialSession, cwd = process.cwd() }) => {
  const { exit } = useApp();
  const [exitPending, setExitPending] = useState(false);

  const {
    session,
    currentModel,
    usage,
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
  } = useAgentRunner({ initialSession, cwd, onExit: () => exit() });

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
