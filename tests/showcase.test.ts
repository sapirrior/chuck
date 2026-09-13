import { describe, expect, it } from 'bun:test';
import { CodeShowcase } from '../src/tui/primitives/CodeShowcase.js';
import { formatToolStatus } from '../src/tui/utils/message-formatter.js';

describe('CodeShowcase Primitive', () => {
  it('renders start mode preview (write_file style)', () => {
    const lines = Array.from({ length: 25 }, (_, i) => `Line content ${i + 1}`);
    const rendered = CodeShowcase.render({
      lines,
      mode: 'start',
      maxLines: 10,
      totalLines: 25,
      headerMessage: 'Wrote 25 lines to file.txt',
    });

    expect(rendered.length).toBeGreaterThan(10);
    expect(rendered[0]).toContain('Wrote 25 lines to file.txt');
    expect(rendered[1]).toContain('1');
    expect(rendered[10]).toContain('10');
    expect(rendered[rendered.length - 1]).toContain('... +15 lines (ctrl+o to expand)');
  });

  it('renders highlight mode preview centered on edit (edit_file style)', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Code line ${i + 1}`);
    const rendered = CodeShowcase.render({
      lines,
      mode: 'highlight',
      highlightLineIndex: 14, // Line 15 (0-indexed 14)
      highlightCount: 2,
      maxLines: 10,
      totalLines: 30,
      headerMessage: 'Updated file.txt',
    });

    expect(rendered[0]).toContain('Updated file.txt');
    expect(rendered.some((l) => l.includes('lines (ctrl+o to expand)'))).toBe(true);
    expect(rendered.some((l) => l.includes('15'))).toBe(true);
  });

  it('renders end mode preview for streaming output (run_command style)', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `stdout output line ${i + 1}`);
    const rendered = CodeShowcase.render({
      lines,
      mode: 'end',
      maxLines: 10,
      totalLines: 50,
    });

    expect(rendered.length).toBe(10);
    expect(rendered.some((l) => l.includes('41'))).toBe(true);
    expect(rendered.some((l) => l.includes('50'))).toBe(true);
  });
});

describe('formatToolStatus with CodeShowcase', () => {
  it('formats edit_file with diff colors and full 10 lines window', () => {
    const diffLines = Array.from({ length: 20 }, (_, i) => {
      if (i === 10)
        return {
          kind: 'delete' as const,
          prefix: '-',
          lineNumber: i + 1,
          text: `old line ${i + 1}`,
        };
      if (i === 11)
        return { kind: 'add' as const, prefix: '+', lineNumber: i + 1, text: `new line ${i + 1}` };
      return {
        kind: 'neutral' as const,
        prefix: ' ',
        lineNumber: i + 1,
        text: `context line ${i + 1}`,
      };
    });

    const result = formatToolStatus({
      toolName: 'edit_file',
      displayName: 'Update',
      status: 'completed',
      argsSummary: JSON.stringify({ path: 'story.txt' }),
      toolOutput: 'Updated story.txt',
      diffLines,
    });

    expect(result[0]).toContain('Update');
    expect(result.some((l) => l.includes('Updated story.txt'))).toBe(true);
    const previewRows = result.filter((l) => l.includes('line '));
    expect(previewRows.length).toBe(10);
  });

  it('formats write_file with plain white line numbers', () => {
    const lines = ['First line', 'Second line', 'Third line'];
    const result = formatToolStatus({
      toolName: 'write_file',
      displayName: 'Write',
      status: 'completed',
      argsSummary: JSON.stringify({ path: 'story.txt' }),
      toolOutput: 'Wrote 3 lines to story.txt',
      previewLines: lines,
      totalLines: 3,
    });

    expect(result[0]).toContain('Write');
    expect(result.some((l) => l.includes('Wrote 3 lines to story.txt'))).toBe(true);
    expect(result.some((l) => l.includes('1') && l.includes('First line'))).toBe(true);
    expect(result.some((l) => l.includes('+') || l.includes('-'))).toBe(false);
  });

  it('formats non-confirmation tools with a clean single summary line and NO 10-line CodeShowcase box', () => {
    const result = formatToolStatus({
      toolName: 'read_file',
      displayName: 'Read',
      status: 'completed',
      argsSummary: JSON.stringify({ path: 'AGENTS.md' }),
      toolOutput: 'Read 48 of 48 lines',
      previewLines: ['1 | # AGENTS.md', '2 | Universal operational guidelines...'],
    });

    // Should only have main line + summary line (2 lines total, NO 10-line CodeShowcase box)
    expect(result.length).toBe(2);
    expect(result[0]).toContain('Read');
    expect(result[0]).toContain('AGENTS.md');
    expect(result[1]).toContain('Read 48 of 48 lines');
    // Ensure no CodeShowcase line numbers or preview boxes
    expect(result.some((l) => l.includes('ctrl+o to expand'))).toBe(false);
  });

  it('formats list_dir and search_text cleanly without CodeShowcase box', () => {
    const listResult = formatToolStatus({
      toolName: 'list_dir',
      displayName: 'List',
      status: 'completed',
      argsSummary: JSON.stringify({ path: '.' }),
      toolOutput: 'Listed 15 entries',
    });

    expect(listResult.length).toBe(2);
    expect(listResult[0]).toContain('List');
    expect(listResult[1]).toContain('Listed 15 entries');
  });
});
