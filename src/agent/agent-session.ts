import type { LanguageModel, ModelMessage } from 'ai';
import { runAgentTurn } from './agent-runner.js';
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
 * (Equivalent to Claude Code's QueryEngine).
 */
export class AgentSession {
  private config: SessionConfig;
  private model: LanguageModel;
  private messages: ModelMessage[] = [];
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

  constructor(initialConfig?: Partial<SessionConfig>) {
    const selection = resolveActiveModelSelection(initialConfig);
    this.config = {
      provider: selection.provider,
      modelId: selection.modelId,
      temperature: initialConfig?.temperature,
      maxSteps: initialConfig?.maxSteps ?? 10,
    };
    this.model = createModelInstance(selection);
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
    this.messages.push({
      role: 'user',
      content: trimmedPrompt,
    });

    // 2. Prepare turn environment
    this.isGenerating = true;
    this.activeAbortController = new AbortController();

    const instructions = buildSystemPrompt({
      extraInstructions: options.extraInstructions,
    });

    try {
      // 3. Execute the turn loop
      const summary = await runAgentTurn({
        model: this.model,
        messages: this.messages,
        instructions,
        tools: options.tools,
        maxSteps: this.config.maxSteps,
        abortSignal: this.activeAbortController.signal,
        onEvent: options.onEvent,
      });

      // 4. Append assistant response to history
      if (summary.text) {
        this.messages.push({
          role: 'assistant',
          content: summary.text,
        });
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

      return summary;
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
   * Resets the conversation history.
   */
  public clearHistory(): void {
    this.messages = [];
  }

  /**
   * Returns accumulated session token metrics.
   */
  public getUsage(): TokenUsage {
    return { ...this.accumulatedUsage };
  }
}
