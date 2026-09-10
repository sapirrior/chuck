import type { CommandContext, CommandResult, SlashCommand } from './types.js';

export const helpCommand: SlashCommand = {
  name: 'help',
  description: 'Show interactive shortcuts and command help',
  usage: '/help',
  execute: async (_args: string[], _context: CommandContext): Promise<CommandResult> => {
    return {
      handled: true,
      data: { showHelp: true },
    };
  },
};
