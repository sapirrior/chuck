import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';
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

export function truncateMiddle(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  const leftChars = Math.floor((maxLength - 1) / 2);
  const rightChars = Math.ceil((maxLength - 1) / 2);
  return `${text.slice(0, leftChars)}…${text.slice(text.length - rightChars)}`;
}

export function extractPrimaryToolParam(args: unknown): string {
  if (!args) return '';
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args);
      return extractPrimaryToolParam(parsed);
    } catch {
      return args.split('\n')[0] ?? '';
    }
  }
  if (typeof args !== 'object' || args === null) {
    return String(args).split('\n')[0] ?? '';
  }

  const record = args as Record<string, unknown>;
  const primaryKeys = [
    'path',
    'file_path',
    'command',
    'pattern',
    'query',
    'target_file',
    'url',
    'seconds',
    'file',
    'name',
    'prompt',
  ];

  for (const k of primaryKeys) {
    if (record[k] !== undefined && record[k] !== null && record[k] !== '') {
      const val = record[k];
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return str.split('\n')[0] ?? '';
    }
  }

  const firstVal = Object.values(record)[0];
  if (firstVal !== undefined && firstVal !== null && firstVal !== '') {
    const str = typeof firstVal === 'object' ? JSON.stringify(firstVal) : String(firstVal);
    return str.split('\n')[0] ?? '';
  }

  return '';
}

export function truncateToWidth(styledText: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (stringWidth(stripAnsi(styledText)) <= maxWidth) return styledText;

  const ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]/g;
  let result = '';
  let currentWidth = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ansiRegex.exec(styledText)) !== null) {
    if (match.index > lastIndex) {
      const plain = styledText.slice(lastIndex, match.index);
      for (const char of plain) {
        const w = stringWidth(char);
        if (currentWidth + w > maxWidth) {
          return result + '\x1b[0m';
        }
        result += char;
        currentWidth += w;
      }
    }
    result += match[0];
    lastIndex = ansiRegex.lastIndex;
  }

  if (lastIndex < styledText.length) {
    const plain = styledText.slice(lastIndex);
    for (const char of plain) {
      const w = stringWidth(char);
      if (currentWidth + w > maxWidth) {
        return result + '\x1b[0m';
      }
      result += char;
      currentWidth += w;
    }
  }

  return result.includes('\x1b') && !result.endsWith('\x1b[0m') ? result + '\x1b[0m' : result;
}

export function getStatusBullet(
  status: 'completed' | 'failed' | 'running' | 'streaming',
  pulse = false,
): string {
  const theme = getTheme();
  if (status === 'completed') {
    return themeColor(theme.success)(figures.blackCircle);
  }
  if (status === 'failed') {
    return themeColor(theme.error)(figures.blackCircle);
  }
  if (pulse) {
    return chalk.white.bold(figures.blackCircle);
  }
  return chalk.dim(figures.blackCircle);
}

export { stripAnsi, getTheme, figures, chalk };
