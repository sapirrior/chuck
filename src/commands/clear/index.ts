import type { CommandContext, CommandResult, SlashCommand } from '../types.js';

/**
 * /clear slash command: resets conversation history and initializes a new session.
 */
export const clearCommand: SlashCommand = {
  name: 'clear',
  description: 'Clears conversation history and starts a fresh session',
  usage: '/clear',

  async execute(_args: string[], context: CommandContext): Promise<CommandResult> {
    if (context.session.isBusy) {
      return {
        handled: true,
        message: 'Cannot clear session while the agent is generating a response.',
      };
    }

    context.session.resetSession();
    return {
      handled: true,
      data: { clearHistory: true },
      message: 'Conversation history cleared. Started a fresh session.',
    };
  },
};
