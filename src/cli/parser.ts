import type { ParsedCliArgs } from './types.js';

export function parseCliArgs(args: string[]): ParsedCliArgs {
  if (args.length === 0) {
    return { command: 'start', rawArgs: args };
  }

  if (args.includes('--version') || args.includes('-v')) {
    return { command: 'version', rawArgs: args };
  }

  if (args.includes('--help') || args.includes('-h')) {
    return { command: 'help', rawArgs: args };
  }

  if (args.includes('--repo') || args.includes('-r')) {
    return { command: 'repo', rawArgs: args };
  }

  const configIdx = args.indexOf('--config');
  if (configIdx !== -1) {
    const subArgs = args.slice(configIdx + 1);
    const target = subArgs[0]?.toLowerCase();

    if (!target) {
      // steward --config -> show current configuration overview
      return {
        command: 'config',
        configArgs: { target: 'all' },
        rawArgs: args,
      };
    }

    if (
      target === 'voice' ||
      target === 'voice.language' ||
      target === 'voice-language' ||
      target === 'language'
    ) {
      const value = subArgs.slice(1).join(' ').trim() || undefined;
      return {
        command: 'config',
        configArgs: { target: 'voice', value },
        rawArgs: args,
      };
    }

    // Invalid config sub-target (e.g. steward --config foo)
    console.error(
      `Error: Unknown configuration target "${target}".\n` +
        `Usage:\n` +
        `  steward --config              View all current configurations\n` +
        `  steward --config voice <lang> Configure preferred voice language`,
    );
    process.exit(1);
  }

  // Any other unrecognized arguments or flags
  const unrecognized = args[0];
  console.error(
    `Error: Unknown option "${unrecognized}".\n` +
      `Run "steward --help" to view all available commands.`,
  );
  process.exit(1);
}
