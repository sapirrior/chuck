import stringWidth from 'string-width';
import { getTheme, figures } from '../../theme/index.js';
import { themeColor, themeBgColor, chalk, formatMarkdown } from './format.js';
import { wrapVisualLine } from '../engine/cell-layout.js';
import type { ToolExecutionStatus } from '../types.js';
import type { StructuredError } from '../../errors/index.js';

function truncateMiddle(text: string, maxLength = 48): string {
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
  const pointer = isBash ? '! ' : `${figures.pointerBold} `;
  const prefix = pointer;

  const availableTextWidth = Math.max(10, wrapWidth - 2);
  const vLines = content.split('\n');
  const lines: string[] = [];

  let isFirstRow = true;
  for (let i = 0; i < vLines.length; i++) {
    const rawLine = vLines[i] ?? '';
    const wrappedSegments = rawLine ? wrapVisualLine(rawLine, availableTextWidth) : [''];

    for (const segment of wrappedSegments) {
      const p = isFirstRow ? prefix : '  ';
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
  const rawLines = content.split('\n');
  return rawLines.map((l, i) =>
    i === 0 ? infoColor(`${figures.info} ${l}`) : infoColor(`  ${l}`),
  );
}

export function formatAssistantMessage(content: string, reasoning?: string): string[] {
  const lines: string[] = [];
  const theme = getTheme();

  if (reasoning) {
    const firstLine = reasoning.split('\n')[0] ?? '';
    const brandColor = themeColor(theme.brand);
    lines.push(
      `${chalk.white(figures.blackCircle)} ${brandColor('Thought')} ${chalk.dim('(ctrl+o to expand)')}`,
    );
    if (firstLine.trim()) {
      lines.push(`  ${chalk.dim('└ ')}${chalk.dim.italic(firstLine.slice(0, 80))}`);
    }
    if (content) {
      lines.push('');
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
          lines.push(`${bullet}${l}`);
        } else {
          lines.push(`  ${l}`);
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
  previewLines?: string[];
}): string[] {
  const theme = getTheme();
  const { toolName, displayName, icon, argsSummary, status, error, toolOutput, previewLines } =
    options;
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
        if (parsed[k] !== undefined) {
          const val = parsed[k];
          rawArg = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
          break;
        }
      }
      if (!rawArg && Object.values(parsed)[0] !== undefined) {
        const val = Object.values(parsed)[0];
        rawArg = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
      }
    } catch {
      rawArg = argsSummary;
    }
  }

  const cleanFirstLine = rawArg.split('\n')[0] ?? '';
  const truncatedArg = truncateMiddle(cleanFirstLine, 48);

  let mainLine = `${bullet} ${dispName}`;
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
    lines.push(`  ${chalk.dim('└ ')}${errColor(errText)}`);
  } else if (previewLines && previewLines.length > 0) {
    const maxPreview = 10;
    const toShow = previewLines.slice(-maxPreview);
    const hiddenCount = previewLines.length - toShow.length;
    if (hiddenCount > 0) {
      lines.push(`  ${chalk.dim(`... +${hiddenCount} lines (ctrl+o to expand)`)}`);
    }
    for (let i = 0; i < toShow.length; i++) {
      const pLine = toShow[i] ?? '';
      const lineNum = hiddenCount + i + 1;
      lines.push(`    ${chalk.dim(`${lineNum}`.padStart(3))} ${chalk.dim(pLine)}`);
    }
  } else if (toolOutput) {
    const outLines = toolOutput.split('\n').filter(Boolean);
    const maxPreview = 10;
    if (outLines.length <= 1) {
      lines.push(
        `  ${chalk.dim('└ ')}${chalk.dim(truncateMiddle(outLines[0] ?? '(no content)', 80))}`,
      );
    } else {
      const toShow = outLines.slice(-maxPreview);
      const hiddenCount = outLines.length - toShow.length;
      if (hiddenCount > 0) {
        lines.push(`  ${chalk.dim(`... +${hiddenCount} lines (ctrl+o to expand)`)}`);
      }
      for (let i = 0; i < toShow.length; i++) {
        const p = i === 0 && hiddenCount === 0 ? `  ${chalk.dim('└ ')}` : '    ';
        lines.push(`${p}${chalk.dim(toShow[i]!)}`);
      }
    }
  }

  return lines;
}

export function formatErrorBadge(
  error: StructuredError,
  retryInfo?: { attempt: number; maxAttempts: number; countdownSec: number },
): string[] {
  const theme = getTheme();
  const errColor = themeColor(theme.error);
  const ast = errColor(figures.asterisk);
  const midDot = chalk.dim(` ${figures.bullet} `);

  let msg = error.shortMessage;
  if (retryInfo) {
    const retryStr = chalk.dim(
      `Retrying in ${retryInfo.countdownSec}s · attempt ${retryInfo.attempt}/${retryInfo.maxAttempts}`,
    );
    msg = `${errColor(error.shortMessage)}${midDot}${retryStr}`;
  } else {
    msg = errColor(error.shortMessage);
  }

  const lines: string[] = [`${ast} ${msg}`];

  if (error.suggestedAction) {
    lines.push(`  ${chalk.dim('└ ')}${chalk.dim(error.suggestedAction)}`);
  }

  return lines;
}

const STATUS_VERBS = ['Baked', 'Brewed', 'Churned', 'Swooped', 'Crafted', 'Cooked'];

export function formatTurnStatus(durationMs: number, timestamp = new Date()): string {
  const verb = STATUS_VERBS[Math.floor(Math.random() * STATUS_VERBS.length)] ?? 'Baked';
  const sec = Math.max(1, Math.round(durationMs / 1000));
  const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const midDot = chalk.dim(` ${figures.bullet} `);

  return `${chalk.dim(`${figures.asterisk} ${verb} for ${sec}s`)}${midDot}${chalk.dim(`done ${timeStr}`)}`;
}
