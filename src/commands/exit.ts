import type { CommandContext, CommandResult, SlashCommand } from './types.js';

export const exitCommand: SlashCommand = {
  name: 'exit',
  description: 'Exit the interactive session',
  usage: '/exit',
  execute: async (_args: string[], _context: CommandContext): Promise<CommandResult> => {
    return {
      handled: true,
      data: { exit: true },
    };
  },
};

export const quitCommand: SlashCommand = {
  name: 'quit',
  description: 'Exit the interactive session',
  usage: '/quit',
  execute: async (args: string[], context: CommandContext): Promise<CommandResult> => {
    return exitCommand.execute(args, context);
  },
};
