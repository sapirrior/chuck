import { clearCommand } from './clear/index.js';
import { effortCommand } from './effort/index.js';
import { exitCommand, quitCommand } from './exit/index.js';
import { modelCommand } from './model/index.js';
import { renameCommand } from './rename/index.js';
import { resumeCommand } from './resume/index.js';
import { rewindCommand } from './rewind/index.js';
import { skillsCommand } from './skills/index.js';
import type { CommandContext, CommandResult, SlashCommand } from './types.js';

export class CommandRegistry {
  private commands = new Map<string, SlashCommand>();

  public register(command: SlashCommand): this {
    this.commands.set(command.name.toLowerCase(), command);
    return this;
  }

  public get(name: string): SlashCommand | undefined {
    return this.commands.get(name.toLowerCase());
  }

  public getAll(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Checks if an input string is a slash command (e.g. "/model", "/clear").
   */
  public isCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  /**
   * Parses and executes a slash command if one matches.
   */
  public async execute(input: string, context: CommandContext): Promise<CommandResult> {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
      return { handled: false };
    }

    const withoutSlash = trimmed.slice(1).trim();
    const parts = withoutSlash.split(/\s+/);
    const commandName = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    if (!commandName) {
      return { handled: false };
    }

    const command = this.commands.get(commandName);
    if (!command) {
      return {
        handled: true,
        message: `Unknown command: /${commandName}. Available commands: ${this.getAll()
          .map((c) => `/${c.name}`)
          .join(', ')}`,
      };
    }

    return command.execute(args, context);
  }
}

export const builtInCommands: SlashCommand[] = [
  rewindCommand,
  modelCommand,
  effortCommand,
  clearCommand,
  exitCommand,
  quitCommand,
  resumeCommand,
  renameCommand,
  skillsCommand,
];

/**
 * Default command registry populated with standard slash commands.
 */
export const defaultCommandRegistry = new CommandRegistry();
for (const cmd of builtInCommands) {
  defaultCommandRegistry.register(cmd);
}
