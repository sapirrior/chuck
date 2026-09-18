import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyUnifiedDiff, buildUnifiedDiff, type UnifiedDiff } from '../../src/utils/diff.js';

describe('Pure Unified Diff Engine (src/utils/diff.ts)', () => {
  const testMatrix: Array<{ name: string; before: string; after: string }> = [
    {
      name: 'identical text',
      before: 'const x = 1;\nconst y = 2;\n',
      after: 'const x = 1;\nconst y = 2;\n',
    },
    {
      name: 'empty -> empty',
      before: '',
      after: '',
    },
    {
      name: 'empty -> populated',
      before: '',
      after: 'hello\nworld\n',
    },
    {
      name: 'populated -> empty',
      before: 'hello\nworld\n',
      after: '',
    },
    {
      name: 'single insertion',
      before: 'line1\nline2\nline3\n',
      after: 'line1\ninserted\nline2\nline3\n',
    },
    {
      name: 'single deletion',
      before: 'line1\nline2\nline3\n',
      after: 'line1\nline3\n',
    },
    {
      name: 'single replacement',
      before: 'line1\nold line\nline3\n',
      after: 'line1\nnew line\nline3\n',
    },
    {
      name: 'multiple independent hunks separated by long context',
      before:
        [
          'head1',
          'head2',
          'head3',
          'head4',
          'head5',
          'target1_old',
          'mid1',
          'mid2',
          'mid3',
          'mid4',
          'mid5',
          'mid6',
          'mid7',
          'mid8',
          'target2_old',
          'tail1',
          'tail2',
          'tail3',
          'tail4',
          'tail5',
        ].join('\n') + '\n',
      after:
        [
          'head1',
          'head2',
          'head3',
          'head4',
          'head5',
          'target1_new',
          'mid1',
          'mid2',
          'mid3',
          'mid4',
          'mid5',
          'mid6',
          'mid7',
          'mid8',
          'target2_new',
          'tail1',
          'tail2',
          'tail3',
          'tail4',
          'tail5',
        ].join('\n') + '\n',
    },
    {
      name: 'adjacent changes merged into single hunk',
      before: 'a\nb\nc\nd\ne\nf\ng\n',
      after: 'a\nb_mod\nc\nd_mod\ne\nf\ng\n',
    },
    {
      name: 'long unchanged regions',
      before: Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n') + '\n',
      after:
        Array.from({ length: 50 }, (_, i) => (i === 25 ? `line 25 modified` : `line ${i}`)).join(
          '\n',
        ) + '\n',
    },
    {
      name: 'repeated identical lines',
      before: 'foo\nfoo\nfoo\nbar\nfoo\nfoo\n',
      after: 'foo\nfoo\nbar\nbar\nfoo\n',
    },
    {
      name: 'blank lines',
      before: 'start\n\n\nmiddle\n\nend\n',
      after: 'start\n\nmodified middle\n\n\nend\n',
    },
    {
      name: 'Unicode and emojis',
      before: 'console.log("Hello 🌍");\nconst 日本語 = "テスト";\n',
      after: 'console.log("Hello 🚀");\nconst 日本語 = "完了";\n',
    },
    {
      name: 'CRLF text',
      before: 'line1\r\nline2\r\nline3\r\n',
      after: 'line1\r\nline2 modified\r\nline3\r\n',
    },
    {
      name: 'trailing newline added',
      before: 'one\ntwo',
      after: 'one\ntwo\n',
    },
    {
      name: 'trailing newline removed',
      before: 'one\ntwo\n',
      after: 'one\ntwo',
    },
    {
      name: 'long lines',
      before: 'short\n' + 'x'.repeat(500) + '\nend\n',
      after: 'short\n' + 'y'.repeat(500) + '\nend\n',
    },
    {
      name: 'multi-line replacement',
      before: 'start\nold1\nold2\nold3\nend\n',
      after: 'start\nnew1\nnew2\nnew3\nnew4\nend\n',
    },
    {
      name: 'addition at beginning',
      before: 'line1\nline2\n',
      after: 'header\nline1\nline2\n',
    },
    {
      name: 'addition at end',
      before: 'line1\nline2\n',
      after: 'line1\nline2\nfooter\n',
    },
    {
      name: 'delete first line',
      before: 'first\nsecond\nthird\n',
      after: 'second\nthird\n',
    },
    {
      name: 'delete last line',
      before: 'first\nsecond\nthird\n',
      after: 'first\nsecond\n',
    },
  ];

  for (const tc of testMatrix) {
    it(`Round-trip invariant: ${tc.name}`, () => {
      const diff = buildUnifiedDiff(tc.before, tc.after, 3);
      const reconstructed = applyUnifiedDiff(tc.before, diff);
      expect(reconstructed).toBe(tc.after);
    });
  }

  it('correctly reports multiple independent hunks with proper line numbers', () => {
    const before =
      [
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
        '10',
        '11',
        '12',
        '13',
        '14',
        '15',
        '16',
        '17',
        '18',
        '19',
        '20',
      ].join('\n') + '\n';

    const after =
      [
        '1',
        '2',
        '3_mod',
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
        '10',
        '11',
        '12',
        '13',
        '14',
        '15',
        '16',
        '17',
        '18_mod',
        '19',
        '20',
      ].join('\n') + '\n';

    const diff = buildUnifiedDiff(before, after, 2);
    expect(diff.hunks.length).toBe(2);

    const hunk1 = diff.hunks[0];
    expect(hunk1.oldStart).toBe(1);
    expect(hunk1.lines.some((l) => l.kind === 'deletion' && l.text === '3')).toBe(true);
    expect(hunk1.lines.some((l) => l.kind === 'addition' && l.text === '3_mod')).toBe(true);

    const hunk2 = diff.hunks[1];
    expect(hunk2.oldStart).toBe(16);
    expect(hunk2.lines.some((l) => l.kind === 'deletion' && l.text === '18')).toBe(true);
    expect(hunk2.lines.some((l) => l.kind === 'addition' && l.text === '18_mod')).toBe(true);
  });

  it('rejects malformed context on applyUnifiedDiff', () => {
    const before = 'line1\nline2\nline3\n';
    const fakeDiff: UnifiedDiff = {
      oldLineCount: 3,
      newLineCount: 3,
      hunks: [
        {
          oldStart: 1,
          oldCount: 3,
          newStart: 1,
          newCount: 3,
          lines: [
            { kind: 'context', text: 'wrong_line1' },
            { kind: 'deletion', text: 'line2' },
            { kind: 'addition', text: 'new_line2' },
            { kind: 'context', text: 'line3' },
          ],
        },
      ],
    };

    expect(() => applyUnifiedDiff(before, fakeDiff)).toThrow(/context mismatch/i);
  });

  it('validates against git diff oracle when git is available', () => {
    const gitAvailable = (() => {
      try {
        const res = spawnSync('git', ['--version']);
        return res.status === 0;
      } catch {
        return false;
      }
    })();

    if (!gitAvailable) return;

    const tmp = join(tmpdir(), `steward-diff-test-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });

    try {
      const fileA = join(tmp, 'a.txt');
      const fileB = join(tmp, 'b.txt');

      const contentA = 'alpha\nbravo\ncharlie\ndelta\necho\nfoxtrot\n';
      const contentB = 'alpha\nbravo\nCHARLIE\ndelta\necho\nFOXTROT\n';

      writeFileSync(fileA, contentA);
      writeFileSync(fileB, contentB);

      const gitRes = spawnSync('git', ['diff', '--no-index', '--unified=2', fileA, fileB]);

      const gitOutput = (gitRes.stdout?.toString() || '') + (gitRes.stderr?.toString() || '');
      const ourDiff = buildUnifiedDiff(contentA, contentB, 2);

      // Verify that git output mentions @@ and our hunks have matching counts
      expect(gitOutput).toContain('@@');
      expect(ourDiff.hunks.length).toBeGreaterThan(0);
      expect(applyUnifiedDiff(contentA, ourDiff)).toBe(contentB);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
