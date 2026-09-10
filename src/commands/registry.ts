import { clearCommand } from './clear.js';
import { modelCommand } from './model.js';
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

/**
 * Default command registry populated with /model and /clear.
 */
export const defaultCommandRegistry = new CommandRegistry();
defaultCommandRegistry.register(modelCommand);
defaultCommandRegistry.register(clearCommand);
