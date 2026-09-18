import { describe, expect, it } from 'bun:test';
import { sleepTool } from '../../src/tools/sleep/index.js';

describe('sleep tool', () => {
  const cwd = process.cwd();

  it('sleeps for requested seconds', async () => {
    const start = Date.now();
    const result = await sleepTool.execute({ seconds: 1 }, { cwd });
    const elapsed = Date.now() - start;

    expect(result.seconds).toBe(1);
    expect(elapsed).toBeGreaterThanOrEqual(950);
  });

  it('aborts sleep if abortSignal fires', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);

    expect(
      sleepTool.execute({ seconds: 2 }, { cwd, abortSignal: controller.signal }),
    ).rejects.toThrow(/Sleep cancelled/);
  });

  it('formats human readable summary correctly', () => {
    const summary = sleepTool.summarize?.({ seconds: 2 }, { seconds: 2 });
    expect(summary).toBe('Slept for 2 seconds');
  });
});
