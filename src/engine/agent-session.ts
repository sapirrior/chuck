import type { LanguageModel, ModelMessage } from 'ai';
import {
  createSession,
  recordSessionTurn,
  renameSession,
  type SessionData,
} from '../session/index.js';
import { runAgentTurn } from './agent-runner.js';
import { SAFETY_STEP_CEILING } from './constants.js';
import type { AgentEventListener } from './events.js';
import { createModelInstance, resolveActiveModelSelection } from './model-provider.js';
import { buildSystemPrompt } from './system-prompt.js';
import type { ModelSelection, SessionConfig, TokenUsage, TurnSummary } from './types.js';

export interface SubmitPromptOptions {
  tools?: Record<string, any>;
  extraInstructions?: string;
  onEvent?: AgentEventListener;
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

  constructor(initialConfig?: Partial<SessionConfig>, existingSession?: SessionData) {
    if (existingSession) {
      this.sessionData = existingSession;
      this.config = {
        provider: existingSession.model.provider,
        modelId: existingSession.model.modelId,
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
    } else {
      const selection = resolveActiveModelSelection(initialConfig);
      this.config = {
        provider: selection.provider,
        modelId: selection.modelId,
        temperature: initialConfig?.temperature,
        maxSteps: initialConfig?.maxSteps ?? SAFETY_STEP_CEILING,
      };
      this.model = createModelInstance(selection);
      this.sessionData = createSession(selection);
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
    const selection = resolveActiveModelSelection(requested);
    this.config.provider = selection.provider;
    this.config.modelId = selection.modelId;
    this.model = createModelInstance(selection);
    return selection;
  }

  /**
   * Returns current active model configuration.
   */
  public getModel(): ModelSelection {
    return {
      provider: this.config.provider,
      modelId: this.config.modelId,
    };
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

    const instructions = buildSystemPrompt({
      extraInstructions: options.extraInstructions,
    });

    let summary: TurnSummary | undefined;

    try {
      // 3. Execute the turn loop
      summary = await runAgentTurn({
        model: this.model,
        messages: this.messages,
        instructions,
        tools: options.tools,
        maxSteps: this.config.maxSteps,
        temperature: this.config.temperature,
        abortSignal: this.activeAbortController.signal,
        onEvent: options.onEvent,
      });

      // 4. Append turn response messages to history
      const responseMessages: ModelMessage[] = [];
      if (summary.rawMessages && summary.rawMessages.length > 0) {
        for (const msg of summary.rawMessages) {
          this.messages.push(msg);
          responseMessages.push(msg);
        }
      } else if (summary.text) {
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

      // 6. Record and persist turn in session document (~/.chuck/sessions/<date>/<sessionId>.json)
      const turnMessages: ModelMessage[] = [userMessage, ...responseMessages];

      recordSessionTurn(this.sessionData, {
        status: 'complete',
        usage: summary.usage,
        messages: turnMessages,
      });

      return summary;
    } catch (err) {
      const responseMessages: ModelMessage[] = summary?.rawMessages ?? [];
      const turnMessages: ModelMessage[] = [userMessage, ...responseMessages];

      if (summary) {
        recordSessionTurn(this.sessionData, {
          status: 'interrupted',
          usage: summary.usage,
          messages: turnMessages,
        });
      } else {
        recordSessionTurn(this.sessionData, {
          status: 'errored',
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          },
          messages: [userMessage],
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
   * Resets the conversation history and initializes a new active session document.
   */
  public resetSession(): void {
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
  }

  /**
   * Returns accumulated session token metrics.
   */
  public getUsage(): TokenUsage {
    return { ...this.accumulatedUsage };
  }
}
