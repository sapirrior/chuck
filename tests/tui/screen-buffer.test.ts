import { describe, it, expect } from 'bun:test';
import { ScreenBuffer } from '../../src/tui/layout/ScreenBuffer.js';
import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';

describe('ScreenBuffer Primitive', () => {
  it('allocates grid and clears to blank rows', () => {
    const buffer = new ScreenBuffer(40, 10);
    expect(buffer.width).toBe(40);
    expect(buffer.height).toBe(10);
    for (let y = 0; y < 10; y++) {
      expect(buffer.getRow(y)).toBe('');
    }
  });

  it('blits plain text and reads back row', () => {
    const buffer = new ScreenBuffer(40, 5);
    buffer.blitText(0, 0, 40, 'Hello world');
    expect(buffer.getRow(0)).toBe('Hello world');
  });

  it('clips text strictly at maxWidth', () => {
    const buffer = new ScreenBuffer(40, 5);
    buffer.blitText(0, 0, 5, 'Hello world');
    expect(buffer.getRow(0)).toBe('Hello');
  });

  it('clips text at buffer boundary', () => {
    const buffer = new ScreenBuffer(10, 5);
    buffer.blitText(8, 0, 10, 'Hello');
    expect(buffer.getRow(0)).toBe('        He');
  });

  it('preserves ANSI styles and resets at line end', () => {
    const buffer = new ScreenBuffer(40, 5);
    buffer.blitText(0, 0, 40, '\x1b[32mGreen\x1b[0m \x1b[1mBold\x1b[0m');
    const row = buffer.getRow(0);
    expect(stripAnsi(row)).toBe('Green Bold');
    expect(row).toContain('\x1b[32mGreen\x1b[0m');
  });

  it('handles wide unicode and emoji characters', () => {
    const buffer = new ScreenBuffer(20, 5);
    buffer.blitText(0, 0, 20, '你好世界');
    const row = buffer.getRow(0);
    expect(row).toBe('你好世界');
    expect(stringWidth(row)).toBe(8);
  });

  it('diffs accurately against previous buffer', () => {
    const buf1 = new ScreenBuffer(20, 3);
    buf1.blitText(0, 0, 20, 'Line 1');
    buf1.blitText(0, 1, 20, 'Line 2');
    buf1.blitText(0, 2, 20, 'Line 3');

    const buf2 = new ScreenBuffer(20, 3);
    buf2.blitText(0, 0, 20, 'Line 1');
    buf2.blitText(0, 1, 20, 'Line 2 modified');
    buf2.blitText(0, 2, 20, 'Line 3');

    const diffs = buf2.diff(buf1);
    expect(diffs.length).toBe(1);
    expect(diffs[0]).toEqual({ row: 1, text: 'Line 2 modified' });
  });
});
