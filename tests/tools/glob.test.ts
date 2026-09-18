import { describe, expect, it } from 'bun:test';
import { globTool } from '../../src/tools/glob/index.js';
import { join } from 'node:path';

describe('glob tool', () => {
  const cwd = process.cwd();

  it('discovers typescript files in src with pattern', async () => {
    const result = await globTool.execute({ pattern: 'src/**/*.ts' }, { cwd });

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files.some((f) => f.includes('tools') || f.includes('engine'))).toBe(true);
    expect(result.totalMatches).toBe(result.files.length);
  });

  it('filters with exact filename', async () => {
    const result = await globTool.execute({ pattern: 'package.json' }, { cwd });

    expect(result.files).toContain('package.json');
  });

  it('formats human readable summary correctly', () => {
    const summary = globTool.summarize?.(
      { pattern: '*.ts' },
      {
        pattern: '*.ts',
        files: ['a.ts', 'b.ts'],
        totalMatches: 2,
        durationMs: 5,
        isTruncated: false,
      },
    );

    expect(summary).toBe('Found 2 files');
  });
});
