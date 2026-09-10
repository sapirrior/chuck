#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './components/app.js';
import { AgentSession } from './engine/index.js';

async function main() {
  try {
    const session = new AgentSession();
    render(<App session={session} cwd={process.cwd()} />, {
      exitOnCtrlC: false,
      incrementalRendering: true,
    });
  } catch (err) {
    console.error('Failed to initialize xd:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
