import type { CommandContext, CommandResult, SlashCommand } from './types.js';
import { listSessions, loadSession } from '../session/index.js';

export const resumeCommand: SlashCommand = {
  name: 'resume',
  description: 'Resume a previous agent session',
  usage: '/resume [sessionId]',
  execute: async (args: string[], _context: CommandContext): Promise<CommandResult> => {
    if (args[0]) {
      const session = loadSession(args[0]);
      if (!session) {
        return {
          handled: true,
          message: `Session not found: ${args[0]}`,
        };
      }
      return {
        handled: true,
        data: { resumeDirect: session },
      };
    }

    const summaries = listSessions();
    const sessions = summaries
      .map((s) => loadSession(s.id))
      .filter((s): s is NonNullable<typeof s> => s !== null);

    return {
      handled: true,
      data: { showResume: true, sessions },
    };
  },
};
