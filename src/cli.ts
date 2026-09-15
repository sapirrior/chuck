#!/usr/bin/env node
import pkg from '../package.json' with { type: 'json' };
import { TUIApp } from './tui/index.js';
import { AgentSession } from './engine/index.js';
import { logError } from './errors/index.js';

// Suppress raw SDK warning output to prevent TUI screen corruption
(globalThis as any).AI_SDK_LOG_WARNINGS = false;

const VERSION: string = pkg.version || '0.0.0';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`chuck ${VERSION}`);
    process.exit(0);
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
    console.error('Failed to initialize chuck:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
