#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './ui/app.js';
import { AgentSession } from './agent/index.js';

async function main() {
  try {
    const session = new AgentSession();
    render(<App session={session} cwd={process.cwd()} />);
  } catch (err) {
    console.error('Failed to initialize xd:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
