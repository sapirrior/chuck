#!/usr/bin/env node
import { runCli } from './cli/index.js';

// Steward CLI entrypoint
// Suppress raw SDK warning output to prevent TUI screen corruption
(globalThis as any).AI_SDK_LOG_WARNINGS = false;

runCli();
