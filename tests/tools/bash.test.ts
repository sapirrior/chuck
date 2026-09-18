import { describe, expect, it } from 'bun:test';
import { classifyCommand } from '../../src/tools/bash/command-policy.js';
import { bashTool } from '../../src/tools/bash/index.js';

describe('Bash Tool & Command Policy', () => {
  const cwd = process.cwd();

  describe('Command Policy Classification', () => {
    it('approves safe read-only commands without permission', () => {
      expect(classifyCommand('ls')).toBe('SAFE_READ_ONLY');
      expect(classifyCommand('ls -la src/')).toBe('SAFE_READ_ONLY');
      expect(classifyCommand('pwd')).toBe('SAFE_READ_ONLY');
      expect(classifyCommand('whoami')).toBe('SAFE_READ_ONLY');
      expect(classifyCommand('git status')).toBe('SAFE_READ_ONLY');
      expect(classifyCommand('git diff')).toBe('SAFE_READ_ONLY');
      expect(classifyCommand('git log -n 5')).toBe('SAFE_READ_ONLY');
      expect(classifyCommand('rg --files')).toBe('SAFE_READ_ONLY');
      expect(classifyCommand('grep -i "hello" src/index.ts')).toBe('SAFE_READ_ONLY');
      expect(classifyCommand('cat package.json')).toBe('SAFE_READ_ONLY');
      expect(classifyCommand('head -n 20 README.md')).toBe('SAFE_READ_ONLY');
    });

    it('requires approval for mutating commands or external execution', () => {
      expect(classifyCommand('rm -rf test/')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('git checkout -b feature')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('git clean -fd')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('git reset --hard HEAD')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('npm install')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('bun test')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('curl -s https://example.com')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('node script.js')).toBe('REQUIRES_APPROVAL');
    });

    it('requires approval for read-only tools with dangerous / execution flags', () => {
      expect(classifyCommand('rg --exec "rm -rf"')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('rg -r "replacement" "target"')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('find . -name "*.log" -delete')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('find . -exec rm {} \\;')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('git log --output=out.txt')).toBe('REQUIRES_APPROVAL');
    });

    it('requires approval for redirection, command substitution, or backgrounding', () => {
      expect(classifyCommand('cat package.json > out.json')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('echo "test" >> log.txt')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('echo $(whoami)')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('ls &')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('cat << EOF\ntest\nEOF')).toBe('REQUIRES_APPROVAL');
    });

    it('requires approval if any command in a chain requires approval', () => {
      expect(classifyCommand('ls && rm -rf temp')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('pwd ; git checkout main')).toBe('REQUIRES_APPROVAL');
      expect(classifyCommand('ls && pwd')).toBe('SAFE_READ_ONLY');
    });
  });

  describe('Bash Execution & Validation', () => {
    it('executes safe read-only command without permission prompt', async () => {
      const res = await bashTool.execute(
        { command: 'echo "hello"', explanation: 'Echo test' },
        { cwd },
      );

      expect(res.stdout?.trim()).toBe('hello');
      expect(res.exitCode).toBe(0);
    });

    it('denies mutating command when user rejects permission', async () => {
      expect(
        bashTool.execute(
          { command: 'mkdir -p test-folder', explanation: 'Create test directory' },
          {
            cwd,
            requestBashPermission: async () => ({ allowed: false }),
          },
        ),
      ).rejects.toThrow(/User denied permission/);
    });

    it('executes mutating command when user approves permission', async () => {
      const res = await bashTool.execute(
        { command: 'echo "approved"', explanation: 'Test approved execution' },
        {
          cwd,
          requestBashPermission: async () => ({ allowed: true }),
        },
      );

      expect(res.stdout?.trim()).toBe('approved');
      expect(res.exitCode).toBe(0);
    });

    it('captures non-zero exit code as a tool failure', async () => {
      expect(
        bashTool.execute(
          { command: 'exit 42', explanation: 'Exit test' },
          {
            cwd,
            requestBashPermission: async () => ({ allowed: true }),
          },
        ),
      ).rejects.toThrow(/failed with exit code 42/);
    });

    it('aborts on context.abortSignal', async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);

      expect(
        bashTool.execute(
          { command: 'sleep 10', explanation: 'Sleep test' },
          {
            cwd,
            abortSignal: controller.signal,
            requestBashPermission: async () => ({ allowed: true }),
          },
        ),
      ).rejects.toThrow(/aborted/);
    });

    it('formats human readable summary correctly', () => {
      const summary = bashTool.summarize?.(
        { command: 'ls', explanation: 'List' },
        { command: 'ls', exitCode: 0, stdout: '', stderr: '', durationMs: 10 },
      );
      expect(summary).toBe('Ran successfully · exit code: 0');

      const bgSummary = bashTool.summarize?.(
        { command: 'sleep 20', explanation: 'Sleep' },
        {
          status: 'backgrounded',
          taskId: 'task-1234',
          command: 'sleep 20',
          message: 'moved to background',
        },
      );
      expect(bgSummary).toBe('Moved to background · task id: task-1234');
    });
  });
});
