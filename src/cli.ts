#!/usr/bin/env node
import { runCli } from './cli/index.js';
import { setupGlobalErrorHandlers } from './errors/index.js';

// Suppress raw SDK warning output to prevent TUI screen corruption
(globalThis as any).AI_SDK_LOG_WARNINGS = false;

// Initialize production-grade global error handlers
setupGlobalErrorHandlers();

runCli();
