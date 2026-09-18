import { describe, expect, it } from 'bun:test';
import { grepTool } from '../../src/tools/grep/index.js';

describe('grep tool', () => {
  const cwd = process.cwd();

  it('finds text pattern in codebase files', async () => {
    const result = await grepTool.execute({ pattern: 'Steward', path: 'src/cli.ts' }, { cwd });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]?.file).toBe('src/cli.ts');
    expect(result.matches[0]?.line).toBeGreaterThan(0);
  });

  it('filters by glob', async () => {
    const result = await grepTool.execute(
      { pattern: 'TerminalEngine', glob: 'src/tui/**/*.ts' },
      { cwd },
    );

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.every((m) => m.file.endsWith('.ts'))).toBe(true);
  });

  it('formats human readable summary correctly', () => {
    const summary = grepTool.summarize?.(
      { pattern: 'test' },
      {
        pattern: 'test',
        matches: [
          { file: 'a.ts', line: 1, text: 'test' },
          { file: 'b.ts', line: 5, text: 'test' },
        ],
        totalMatches: 2,
        fileCount: 2,
        durationMs: 10,
        isTruncated: false,
      },
    );

    expect(summary).toBe('Found 2 matches in 2 files');
  });
});
