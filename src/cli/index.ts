import { TUIApp } from '../tui/index.js';
import { AgentSession } from '../engine/index.js';
import { logError } from '../errors/index.js';
import { parseCliArgs } from './parser.js';
import { handleConfigCommand } from './commands/config/index.js';
import { handleVersionCommand, VERSION } from './commands/version/index.js';
import { handleHelpCommand } from './commands/help/index.js';
import { handleRepoCommand, REPO_URL } from './commands/repo/index.js';

export * from './types.js';
export * from './parser.js';
export { VERSION, REPO_URL };

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseCliArgs(argv);

  if (parsed.command === 'version') {
    handleVersionCommand();
    return;
  }

  if (parsed.command === 'help') {
    handleHelpCommand();
    return;
  }

  if (parsed.command === 'repo') {
    handleRepoCommand();
    return;
  }

  if (parsed.command === 'config' && parsed.configArgs) {
    handleConfigCommand(parsed.configArgs);
    return;
  }

  try {
    const session = new AgentSession();
    const app = new TUIApp({
      version: VERSION,
      initialSession: session,
      cwd: process.cwd(),
      onExit: () => process.exit(0),
    });
    await app.start();
  } catch (err) {
    logError(err, { phase: 'initialization' });
    console.error(
      'Failed to initialize steward:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}
