import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { getTheme, figures, type UITheme } from '../../theme/index.js';
import { applyMarkdown } from '../../utils/markdown.js';

export function themeColor(color: string) {
  if (color.startsWith('rgb(')) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      return chalk.rgb(Number(match[0]), Number(match[1]), Number(match[2]));
    }
  }
  return chalk.hex(color);
}

export function themeBgColor(color: string) {
  if (color.startsWith('rgb(')) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      return chalk.bgRgb(Number(match[0]), Number(match[1]), Number(match[2]));
    }
  }
  return chalk.bgHex(color);
}

export function formatMarkdown(md: string): string {
  return applyMarkdown(md);
}

export function extractThinking(text: string): { thinking?: string; response?: string } {
  const match = text.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (match) {
    const thinking = match[1]?.trim();
    const response = text.replace(/<thinking>[\s\S]*?<\/thinking>/i, '').trim();
    return { thinking, response };
  }

  // Check for open thinking tag in streaming state
  const openMatch = text.match(/<thinking>([\s\S]*)$/i);
  if (openMatch) {
    return { thinking: openMatch[1]?.trim() };
  }

  return { response: text };
}

export { stripAnsi, getTheme, figures, chalk };
