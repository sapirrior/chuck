#!/usr/bin/env node
import { TUIApp } from './tui/index.js';
import { AgentSession } from './engine/index.js';

async function main() {
  try {
    const session = new AgentSession();
    const app = new TUIApp({
      initialSession: session,
      cwd: process.cwd(),
      onExit: () => process.exit(0),
    });
    await app.start();
  } catch (err) {
    console.error('Failed to initialize xd:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
