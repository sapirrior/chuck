import { discoverSkills } from '../../skills/index.js';
import type { CommandContext, CommandResult, SlashCommand } from '../types.js';

/**
 * /skills slash command: discovers and displays available skills and their descriptions.
 */
export const skillsCommand: SlashCommand = {
  name: 'skills',
  description: 'Shows available skills and their descriptions',
  usage: '/skills',

  async execute(_args: string[], context: CommandContext): Promise<CommandResult> {
    const skills = discoverSkills(context.cwd);

    if (skills.length === 0) {
      return {
        handled: true,
        message: 'No skills found in .agents/skills/, ~/.agents/skills/, or ~/.steward/skills/',
      };
    }

    const lines: string[] = [`Available skills (${skills.length}):`];

    for (const skill of skills) {
      lines.push(`• ${skill.name} (${skill.filePath})`);
    }

    return {
      handled: true,
      message: lines.join('\n'),
    };
  },
};
