import type { CommandContext, CommandResult, SlashCommand } from '../types.js';

export const rewindCommand: SlashCommand = {
  name: 'rewind',
  description: 'Rewind conversation and code changes to a prior turn',
  usage: '/rewind',
  execute: async (_args: string[], context: CommandContext): Promise<CommandResult> => {
    if (context.session.isBusy) {
      return {
        handled: true,
        message: 'Cannot rewind while the agent is actively processing a turn.',
      };
    }

    const turns = context.session.session.turns;
    if (!turns || turns.length === 0) {
      return {
        handled: true,
        message: 'No turns in current session to rewind.',
      };
    }

    return {
      handled: true,
      data: { showRewind: true },
    };
  },
};
