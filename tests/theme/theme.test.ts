import { describe, it, expect } from 'bun:test';
import { darkTheme, lightTheme, getTheme } from '../../src/theme/colors.js';

describe('Theme Alignment & Palette Tests', () => {
  it('aligns darkTheme colors with default dark palette specifications', () => {
    expect(darkTheme.promptBorder).toBe('rgb(136,136,136)');
    expect(darkTheme.userCardBg).toBe('rgb(55,55,55)');
    expect(darkTheme.brand).toBe('rgb(215,119,87)');
    expect(darkTheme.brandShimmer).toBe('rgb(235,159,127)');
    expect(darkTheme.permission).toBe('rgb(177,185,249)');
    expect(darkTheme.bashPink).toBe('rgb(253,93,177)');
    expect(darkTheme.success).toBe('rgb(78,186,101)');
    expect(darkTheme.error).toBe('rgb(255,107,128)');
    expect(darkTheme.warning).toBe('rgb(255,193,7)');
    expect(darkTheme.text).toBe('rgb(255,255,255)');
    expect(darkTheme.subtle).toBe('rgb(80,80,80)');
    expect(darkTheme.inactive).toBe('rgb(153,153,153)');
  });

  it('returns active theme from getTheme', () => {
    const theme = getTheme();
    expect(theme).toBeDefined();
    expect(theme.brand).toBe(darkTheme.brand);
  });
});
