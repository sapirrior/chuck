import { randomUUID } from 'node:crypto';
import type { LanguageModel, ModelMessage } from 'ai';
import {
  createSession,
  formatToolOutputSummary,
  getCurrentDateString,
  recordSessionTurn,
  renameSession,
  saveSession,
  SessionLogWriter,
  chooseTurnStatusVerb,
  type SessionData,
} from '../session/index.js';
import {
  MutationCheckpointTracker,
  globalMutationLockManager,
} from '../services/checkpoint/index.js';
import { defaultToolCatalog } from '../tools/index.js';
import type { ToolContext } from '../tools/types.js';
import { ShellTaskManager } from '../services/tasks/manager.js';
import { saveSettings } from '../config/index.js';
import { logError } from '../errors/index.js';
import { runAgentTurn } from './agent-runner.js';
import { SAFETY_STEP_CEILING } from './constants.js';
import type { AgentEventListener } from './events.js';
import { createModelInstance, resolveActiveModelSelection } from './model-provider.js';
import { buildSystemPrompt } from './system-prompt.js';
import type {
  ModelSelection,
  ReasoningEffort,
  SessionConfig,
  TokenUsage,
  TurnSummary,
} from './types.js';

export interface SubmitPromptOptions {
  cwd?: string;
  tools?: Record<string, any> | ((context: ToolContext) => Record<string, any>);
  extraInstructions?: string;
  onEvent?: AgentEventListener;
  requestBashPermission?: (
    req: import('../tools/types.js').BashPermissionRequest,
  ) => Promise<import('../tools/types.js').BashPermissionResponse>;
  requestFilePermission?: (
    req: import('../tools/types.js').FilePermissionRequest,
  ) => Promise<import('../tools/types.js').FilePermissionResponse>;
}

/**
 * Stateful conversation session harness managing message history,
 * active model configuration, abort controls, and turn execution.
 */
export class AgentSession {
  private config: SessionConfig;
  private model: LanguageModel;
  private messages: ModelMessage[] = [];
  private sessionData: SessionData;
  private sessionLogWriter?: SessionLogWriter;
  private accumulatedUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  private activeAbortController: AbortController | null = null;
  private isGenerating = false;
  private shellTasks: ShellTaskManager = new ShellTaskManager();

  constructor(initialConfig?: Partial<SessionConfig>, existingSession?: SessionData) {
    if (existingSession) {
      this.sessionData = existingSession;
      this.config = {
        provider: existingSession.model.provider,
        modelId: existingSession.model.modelId,
        reasoningEffort: existingSession.model.effort ?? 'provider-default',
        temperature: initialConfig?.temperature,
        maxSteps: initialConfig?.maxSteps ?? SAFETY_STEP_CEILING,
      };
      this.model = createModelInstance(existingSession.model);
      this.accumulatedUsage = { ...existingSession.totalUsage };

      // Rehydrate message history from stored turns — canonical single path from turn.messages
      for (const turn of existingSession.turns) {
        if (turn.messages && turn.messages.length > 0) {
          for (const msg of turn.messages) {
            this.messages.push(msg);
          }
        }
      }
      this.sessionLogWriter = new SessionLogWriter(
        this.sessionData.date || getCurrentDateString(),
        this.sessionData.id,
      );
    } else {
      const selection = resolveActiveModelSelection(initialConfig);
      this.config = {
        provider: selection.provider,
        modelId: selection.modelId,
        reasoningEffort: selection.effort ?? 'provider-default',
        temperature: initialConfig?.temperature,
        maxSteps: initialConfig?.maxSteps ?? SAFETY_STEP_CEILING,
      };
      this.model = createModelInstance(selection);
      this.sessionData = createSession(selection);
      this.sessionLogWriter = new SessionLogWriter(
        this.sessionData.date || getCurrentDateString(),
        this.sessionData.id,
      );
    }
  }

  /**
   * Resumes an existing session from its stored document.
   */
  public static resume(sessionData: SessionData): AgentSession {
    return new AgentSession(undefined, sessionData);
  }

  /**
   * Returns the underlying session persistence document.
   */
  public get session(): SessionData {
    return this.sessionData;
  }

  /**
   * Switches the active model dynamically (e.g. via /model command).
   */
  public setModel(requested: Partial<ModelSelection>): ModelSelection {
    const selection = resolveActiveModelSelection({
      provider: requested.provider,
      modelId: requested.modelId,
      effort: requested.effort ?? this.config.reasoningEffort,
    });
    this.config.provider = selection.provider;
    this.config.modelId = selection.modelId;
    this.config.reasoningEffort = selection.effort ?? 'provider-default';
    this.model = createModelInstance(selection);

    // Update active session metadata & persist
    this.sessionData.model = { ...selection };
    this.sessionData.updatedAt = new Date().toISOString();
    saveSession(this.sessionData);

    return selection;
  }

  /**
   * Returns current active model configuration.
   */
  public getModel(): ModelSelection {
    return {
      provider: this.config.provider,
      modelId: this.config.modelId,
      effort: this.config.reasoningEffort ?? 'provider-default',
    };
  }

  /**
   * Returns current reasoning effort level.
   */
  public getEffort(): ReasoningEffort {
    return this.config.reasoningEffort ?? 'provider-default';
  }

  /**
   * Sets the reasoning effort level, updates session metadata and persists preference.
   */
  public setEffort(effort: ReasoningEffort, persist = true): ReasoningEffort {
    this.config.reasoningEffort = effort;
    this.sessionData.model.effort = effort;
    this.sessionData.updatedAt = new Date().toISOString();
    saveSession(this.sessionData);

    if (persist) {
      saveSettings({
        model: {
          provider: this.config.provider,
          modelId: this.config.modelId,
          effort,
        },
      });
    }

    return effort;
  }

  /**
   * Renames the active session and saves the update to disk.
   */
  public renameSession(newName: string): string {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error('Session name cannot be empty.');
    }
    this.sessionData.name = trimmed;
    renameSession(this.sessionData, trimmed);
    return trimmed;
  }

  /**
   * Submits a user prompt and runs the turn loop.
   */
  public async submitPrompt(
    prompt: string,
    options: SubmitPromptOptions = {},
  ): Promise<TurnSummary> {
    if (this.isGenerating) {
      throw new Error('Agent is already processing a turn. Please wait or abort.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Prompt cannot be empty.');
    }

    // 1. Append user message to history
    const userMessage: ModelMessage = {
      role: 'user',
      content: trimmedPrompt,
    };
    this.messages.push(userMessage);

    // 2. Prepare turn environment
    this.isGenerating = true;
    this.activeAbortController = new AbortController();

    const turnId = randomUUID();
    const turnStartedAt = new Date().toISOString();
    const turnStartMonotonic = performance.now();
    const turnModel = this.getModel();

    this.sessionLogWriter?.append({
      schemaVersion: 1,
      sessionId: this.sessionData.id,
      turnId,
      type: 'turn-start',
      timestamp: turnStartedAt,
      startedAt: turnStartedAt,
      model: {
        provider: turnModel.provider,
        modelId: turnModel.modelId,
        effort: turnModel.effort,
      },
    });

    const cwd = options.cwd ?? process.cwd();
    const tracker = new MutationCheckpointTracker({
      workspaceRoot: cwd,
      sessionId: this.sessionData.id,
      lockManager: globalMutationLockManager,
    });
    await tracker.beginTurn(turnId, this.sessionData.turns.length + 1);

    const toolContext: ToolContext = {
      cwd,
      abortSignal: this.activeAbortController.signal,
      checkpointTracker: tracker,
      mutationLocks: globalMutationLockManager,
      requestBashPermission: options.requestBashPermission,
      requestFilePermission: options.requestFilePermission,
      shellTasks: this.shellTasks,
    };

    let activeTools: Record<string, any> | undefined;
    if (typeof options.tools === 'function') {
      activeTools = (options.tools as any)(toolContext);
    } else if (options.tools) {
      activeTools = options.tools;
    } else {
      activeTools = defaultToolCatalog.toAISDKTools(toolContext);
    }

    const instructions = buildSystemPrompt({
      extraInstructions: options.extraInstructions,
    });

    const wrappedOnEvent: AgentEventListener = (event) => {
      if (event.type === 'tool-call') {
        this.sessionLogWriter?.append({
          schemaVersion: 1,
          sessionId: this.sessionData.id,
          turnId,
          type: 'tool-start',
          timestamp: new Date().toISOString(),
          toolCallId: event.toolCall.id,
          toolName: event.toolCall.name,
          startedAt: new Date().toISOString(),
        });
      } else if (event.type === 'tool-result') {
        const toolDef = defaultToolCatalog.get(event.toolResult.name);
        const outputSummary =
          !event.toolResult.isError && toolDef?.summarize
            ? toolDef.summarize(event.toolResult.args, event.toolResult.result)
            : formatToolOutputSummary(event.toolResult.result, event.toolResult.isError);
        const errorMessage = event.toolResult.isError
          ? typeof event.toolResult.result === 'object' && event.toolResult.result !== null
            ? ((event.toolResult.result as any).message ?? JSON.stringify(event.toolResult.result))
            : String(event.toolResult.result)
          : undefined;
        const status = event.toolResult.isError ? 'failed' : 'completed';

        this.sessionLogWriter?.append({
          schemaVersion: 1,
          sessionId: this.sessionData.id,
          turnId,
          type: 'tool-end',
          timestamp: event.toolResult.finishedAt ?? new Date().toISOString(),
          toolCallId: event.toolResult.id,
          toolName: event.toolResult.name,
          finishedAt: event.toolResult.finishedAt ?? new Date().toISOString(),
          durationMs: event.toolResult.durationMs,
          status,
          displayName: toolDef?.displayName,
          icon: toolDef?.icon,
          outputSummary,
          errorMessage,
        });
      }
      options.onEvent?.(event);
    };

    let summary: TurnSummary | undefined;

    try {
      // 3. Execute the turn loop
      summary = await runAgentTurn({
        model: this.model,
        messages: this.messages,
        instructions,
        tools: activeTools,
        maxSteps: this.config.maxSteps,
        temperature: this.config.temperature,
        reasoningEffort: this.config.reasoningEffort,
        abortSignal: this.activeAbortController.signal,
        onEvent: wrappedOnEvent,
      });

      // 4. Append turn response messages to history
      const responseMessages: ModelMessage[] = [];
      if (summary.rawMessages && summary.rawMessages.length > 0) {
        for (const msg of summary.rawMessages) {
          this.messages.push(msg);
          responseMessages.push(msg);
        }
      }

      // If the model produced final text (e.g. Gemini, Anthropic, OpenAI) that was not
      // represented in rawMessages, ensure it is preserved in history and persisted
      const hasAssistantMessage = responseMessages.some((m) => m.role === 'assistant');
      if (summary.text && !hasAssistantMessage) {
        const assistantMsg: ModelMessage = {
          role: 'assistant',
          content: summary.text,
        };
        this.messages.push(assistantMsg);
        responseMessages.push(assistantMsg);
      }

      // 5. Accumulate usage
      this.accumulatedUsage.inputTokens += summary.usage.inputTokens;
      this.accumulatedUsage.outputTokens += summary.usage.outputTokens;
      this.accumulatedUsage.totalTokens += summary.usage.totalTokens;
      if (summary.usage.reasoningTokens) {
        this.accumulatedUsage.reasoningTokens =
          (this.accumulatedUsage.reasoningTokens ?? 0) + summary.usage.reasoningTokens;
      }
      if (summary.usage.cacheReadTokens) {
        this.accumulatedUsage.cacheReadTokens =
          (this.accumulatedUsage.cacheReadTokens ?? 0) + summary.usage.cacheReadTokens;
      }

      const statusVerb = chooseTurnStatusVerb();
      summary.statusVerb = statusVerb;

      // 6. Record and persist turn in session document (~/.steward/sessions/<date>/<sessionId>.json)
      const turnMessages: ModelMessage[] = [userMessage, ...responseMessages];

      recordSessionTurn(this.sessionData, {
        id: turnId,
        status: 'complete',
        usage: summary.usage,
        messages: turnMessages,
      });

      await tracker.commitTurn(turnId, 'complete');

      const turnFinishedAt = summary.finishedAt ?? new Date().toISOString();
      const turnDurationMs =
        summary.durationMs ?? Math.max(0, Math.round(performance.now() - turnStartMonotonic));

      this.sessionLogWriter?.append({
        schemaVersion: 1,
        sessionId: this.sessionData.id,
        turnId,
        type: 'turn-end',
        timestamp: turnFinishedAt,
        finishedAt: turnFinishedAt,
        durationMs: turnDurationMs,
        status: 'complete',
        statusVerb,
        stopReason: summary.stopReason,
        finishReason: summary.finishReason,
      });

      return summary;
    } catch (err) {
      logError(err, {
        sessionId: this.sessionData.id,
        model: this.getModel(),
        hasPartialSummary: Boolean(summary),
      });

      const turnFinishedAt = new Date().toISOString();
      const turnDurationMs = Math.max(0, Math.round(performance.now() - turnStartMonotonic));
      const statusVerb = chooseTurnStatusVerb();

      const responseMessages: ModelMessage[] = summary?.rawMessages ?? [];
      const turnMessages: ModelMessage[] = [userMessage, ...responseMessages];

      if (summary) {
        this.accumulatedUsage.inputTokens += summary.usage.inputTokens;
        this.accumulatedUsage.outputTokens += summary.usage.outputTokens;
        this.accumulatedUsage.totalTokens += summary.usage.totalTokens;
        if (summary.usage.reasoningTokens) {
          this.accumulatedUsage.reasoningTokens =
            (this.accumulatedUsage.reasoningTokens ?? 0) + summary.usage.reasoningTokens;
        }
        if (summary.usage.cacheReadTokens) {
          this.accumulatedUsage.cacheReadTokens =
            (this.accumulatedUsage.cacheReadTokens ?? 0) + summary.usage.cacheReadTokens;
        }

        summary.statusVerb = statusVerb;

        recordSessionTurn(this.sessionData, {
          id: turnId,
          status: 'interrupted',
          usage: summary.usage,
          messages: turnMessages,
        });
        await tracker.commitTurn(turnId, 'interrupted');

        this.sessionLogWriter?.append({
          schemaVersion: 1,
          sessionId: this.sessionData.id,
          turnId,
          type: 'turn-end',
          timestamp: turnFinishedAt,
          finishedAt: turnFinishedAt,
          durationMs: turnDurationMs,
          status: 'interrupted',
          statusVerb,
          stopReason: summary.stopReason,
          finishReason: summary.finishReason,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      } else {
        recordSessionTurn(this.sessionData, {
          id: turnId,
          status: 'errored',
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          },
          messages: [userMessage],
        });
        await tracker.commitTurn(turnId, 'errored');

        this.sessionLogWriter?.append({
          schemaVersion: 1,
          sessionId: this.sessionData.id,
          turnId,
          type: 'turn-end',
          timestamp: turnFinishedAt,
          finishedAt: turnFinishedAt,
          durationMs: turnDurationMs,
          status: 'errored',
          statusVerb,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    } finally {
      this.isGenerating = false;
      this.activeAbortController = null;
    }
  }

  /**
   * Aborts the ongoing generation if active.
   */
  public abort(): void {
    if (this.activeAbortController && this.isGenerating) {
      this.activeAbortController.abort();
    }
  }

  /**
   * Returns whether the session is currently generating output.
   */
  public get isBusy(): boolean {
    return this.isGenerating;
  }

  /**
   * Returns a copy of the conversation history.
   */
  public getHistory(): ModelMessage[] {
    return [...this.messages];
  }

  /**
   * Returns the session-scoped ShellTaskManager instance.
   */
  public get tasks(): ShellTaskManager {
    return this.shellTasks;
  }

  /**
   * Shuts down session resources including background shell tasks.
   */
  public async shutdown(): Promise<void> {
    await this.shellTasks.shutdown();
    await this.sessionLogWriter?.close();
  }

  /**
   * Resets the conversation history, terminates old background tasks, and initializes a new active session document.
   */
  public async resetSession(): Promise<void> {
    await this.shellTasks.shutdown();
    await this.sessionLogWriter?.close();
    this.shellTasks = new ShellTaskManager();
    this.messages = [];
    this.accumulatedUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    this.sessionData = createSession({
      provider: this.config.provider,
      modelId: this.config.modelId,
    });
    this.sessionLogWriter = new SessionLogWriter(
      this.sessionData.date || getCurrentDateString(),
      this.sessionData.id,
    );
  }

  /**
   * Returns accumulated session token metrics.
   */
  public getUsage(): TokenUsage {
    return { ...this.accumulatedUsage };
  }
}
