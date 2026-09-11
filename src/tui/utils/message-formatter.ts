import stringWidth from 'string-width';
import { getTheme, figures } from '../../theme/index.js';
import { themeColor, themeBgColor, chalk, formatMarkdown } from './format.js';
import { wrapVisualLine } from '../engine/cell-layout.js';
import type { ToolExecutionStatus } from '../types.js';

function truncateMiddle(text: string, maxLength = 36): string {
  if (!text || text.length <= maxLength) return text;
  const leftChars = Math.floor((maxLength - 1) / 2);
  const rightChars = Math.ceil((maxLength - 1) / 2);
  return `${text.slice(0, leftChars)}…${text.slice(text.length - rightChars)}`;
}

export function formatUserMessage(content: string, isBash = false, targetWidth?: number): string[] {
  const theme = getTheme();
  const fullTermWidth = process.stdout.columns || 80;
  const wrapWidth = targetWidth ?? fullTermWidth;
  const bg = themeBgColor(theme.userCardBg);
  const chevColor = isBash ? themeColor(theme.bashPink) : themeColor(theme.userChevron);
  const pointer = isBash ? '! ' : `${figures.pointer} `;
  const prefix = ` ${pointer}`;

  const availableTextWidth = Math.max(10, wrapWidth - 3);
  const vLines = content.split('\n');
  const lines: string[] = [];

  let isFirstRow = true;
  for (let i = 0; i < vLines.length; i++) {
    const rawLine = vLines[i] ?? '';
    const wrappedSegments = rawLine ? wrapVisualLine(rawLine, availableTextWidth) : [''];

    for (const segment of wrappedSegments) {
      const p = isFirstRow ? prefix : '   ';
      isFirstRow = false;
      const visibleLen = stringWidth(p) + stringWidth(segment);
      const padLen = Math.max(0, fullTermWidth - visibleLen);
      const pStyled = isBash ? chevColor(p) : themeColor(theme.userChevron)(p);
      const textStyled = isBash ? chevColor(segment) : chalk.white(segment);
      const fullRow = bg(`${pStyled}${textStyled}${' '.repeat(padLen)}`);
      lines.push(fullRow);
    }
  }

  return lines;
}

export function formatSystemMessage(content: string): string[] {
  const theme = getTheme();
  const infoColor = themeColor(theme.permission);
  return [`  ${infoColor(`${figures.info} ${content}`)}`];
}

export function formatAssistantMessage(content: string, reasoning?: string): string[] {
  const lines: string[] = [];
  const theme = getTheme();

  if (reasoning) {
    const ast = chalk.dim.italic(`${figures.teardropAsterisk} ${reasoning}`);
    for (const l of ast.split('\n')) {
      lines.push(`    ${l}`);
    }
  }

  if (content) {
    const formatted = formatMarkdown(content);
    if (formatted) {
      const rawLines = formatted.split('\n');
      while (rawLines.length > 0 && !rawLines[0]?.trim()) {
        rawLines.shift();
      }
      while (rawLines.length > 0 && !rawLines[rawLines.length - 1]?.trim()) {
        rawLines.pop();
      }

      for (let i = 0; i < rawLines.length; i++) {
        const l = rawLines[i] ?? '';
        if (!l.trim()) {
          lines.push('');
          continue;
        }
        if (i === 0) {
          const bullet = chalk.white(`${figures.blackCircle} `);
          lines.push(` ${bullet}${l}`);
        } else {
          lines.push(`   ${l}`);
        }
      }
    }
  }

  return lines;
}

export function formatToolStatus(options: {
  toolName: string;
  displayName?: string;
  icon?: string;
  argsSummary?: string;
  status: ToolExecutionStatus;
  durationMs?: number;
  error?: string;
  toolOutput?: string;
}): string[] {
  const theme = getTheme();
  const { toolName, displayName, icon, argsSummary, status, error, toolOutput } = options;
  const dispName =
    displayName ||
    (toolName.length > 0 ? toolName[0]!.toUpperCase() + toolName.slice(1) : toolName);
  const bulletGlyph = icon || figures.blackCircle;

  let bullet = themeColor(theme.bulletRunning)(bulletGlyph);
  if (status === 'completed') {
    bullet = themeColor(theme.bulletSuccess)(bulletGlyph);
  } else if (status === 'failed') {
    bullet = themeColor(theme.bulletError)(bulletGlyph);
  }

  // Extract primary single-line argument
  let rawArg = '';
  if (argsSummary) {
    try {
      const parsed = JSON.parse(argsSummary);
      const primaryKeys = [
        'path',
        'file_path',
        'target_file',
        'command',
        'url',
        'query',
        'pattern',
        'name',
        'prompt',
      ];
      for (const k of primaryKeys) {
        if (parsed[k]) {
          rawArg = String(parsed[k]);
          break;
        }
      }
      if (!rawArg && Object.values(parsed)[0]) {
        rawArg = String(Object.values(parsed)[0]);
      }
    } catch {
      rawArg = argsSummary;
    }
  }

  const cleanFirstLine = rawArg.split('\n')[0] ?? '';
  const truncatedArg = truncateMiddle(cleanFirstLine, 36);

  let mainLine = ` ${bullet} ${dispName}`;
  if (truncatedArg) {
    mainLine += `${chalk.dim('(')}${chalk.dim(truncatedArg)}${chalk.dim(')')}`;
  }

  const lines: string[] = [mainLine];

  if (error) {
    const isInterrupted =
      error.toLowerCase().includes('interrupted') ||
      error.toLowerCase().includes('declined') ||
      error.toLowerCase().includes('cancelled');

    const errText = isInterrupted ? 'Interrupted · What should xd do instead?' : error;
    const errColor = isInterrupted ? chalk.dim : themeColor(theme.error);
    lines.push(`   ${chalk.dim('└ ')}${errColor(errText)}`);
  } else if (toolOutput) {
    lines.push(`   ${chalk.dim('└ ')}${chalk.dim(truncateMiddle(toolOutput, 60))}`);
  }

  return lines;
}
