import type { CommandContext, CommandResult, SlashCommand } from '../types.js';

/**
 * /rename slash command: renames the active session title.
 */
export const renameCommand: SlashCommand = {
  name: 'rename',
  description: 'Renames the current conversation session',
  usage: '/rename <new title>',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    const newName = args.join(' ').trim();

    if (!newName) {
      return {
        handled: true,
        message: 'Usage: /rename <new session name>',
      };
    }

    try {
      context.session.renameSession(newName);
      return {
        handled: true,
        message: `Session renamed to "${newName}".`,
      };
    } catch (err) {
      return {
        handled: true,
        message: `Failed to rename session: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
