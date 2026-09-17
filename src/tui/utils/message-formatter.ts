import stringWidth from 'string-width';
import { getTheme, figures } from '../../theme/index.js';
import {
  themeColor,
  themeBgColor,
  chalk,
  formatMarkdown,
  stripAnsi,
  getStatusBullet,
  truncateMiddle,
} from './format.js';
import { wrapVisualLine } from '../engine/cell-layout.js';
import type { ToolExecutionStatus } from '../types.js';
import type { StructuredError } from '../../errors/index.js';

export function formatUserMessage(content: string, targetWidth?: number): string[] {
  const theme = getTheme();
  const termCols =
    typeof targetWidth === 'number' && targetWidth > 0 ? targetWidth : process.stdout.columns || 80;
  const bg = themeBgColor(theme.userCardBg);
  const pointer = `${figures.pointerBold} `;
  const prefix = pointer;

  const availableTextWidth = Math.max(10, termCols - 2);
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
      const padLen = Math.max(0, termCols - visibleLen);
      const pStyled = themeColor(theme.userChevron)(p);
      const textStyled = chalk.white(segment);
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
    i === 0 ? `  ${chalk.dim('└ ')}${infoColor(l)}` : `    ${infoColor(l)}`,
  );
}

export function formatAssistantMessage(content: string): string[] {
  const lines: string[] = [];

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

      if (rawLines.length > 0) {
        lines.push('');
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
  targetWidth?: number;
}): string[] {
  const { toolName, displayName, icon, argsSummary, status, error, targetWidth } = options;
  const theme = getTheme();
  const fullTermWidth =
    typeof targetWidth === 'number' && targetWidth > 0 ? targetWidth : process.stdout.columns || 80;

  const bullet = getStatusBullet(status);
  const dispName = displayName ?? icon ?? toolName;

  // Extract primary single-line argument
  let rawArg = '';
  if (argsSummary) {
    try {
      const parsed = JSON.parse(argsSummary);
      const primaryKeys = [
        'path',
        'file_path',
        'command',
        'pattern',
        'query',
        'seconds',
        'url',
        'file',
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
  const maxArgLen = Math.max(10, fullTermWidth - dispName.length - 8);
  const truncatedArg =
    cleanFirstLine.length > maxArgLen ? truncateMiddle(cleanFirstLine, maxArgLen) : cleanFirstLine;

  let mainLine = `${bullet} ${dispName}`;
  if (truncatedArg) {
    mainLine += `${chalk.dim('(')}${chalk.dim(truncatedArg)}${chalk.dim(')')}`;
  }

  const lines: string[] = [mainLine];

  // Completed successful calls display the compact tool summary
  if (status === 'completed' && options.toolOutput) {
    const cleanOutput = options.toolOutput.trim();
    if (cleanOutput) {
      const firstLineOut = cleanOutput.split('\n')[0]?.trim() || cleanOutput;
      const formattedOut = firstLineOut.startsWith('└ ') ? firstLineOut.slice(2) : firstLineOut;
      const maxOutLen = Math.max(10, fullTermWidth - 6);
      const truncatedOut =
        formattedOut.length > maxOutLen ? `${formattedOut.slice(0, maxOutLen - 1)}…` : formattedOut;
      lines.push(`  ${chalk.dim('└ ')}${chalk.white(truncatedOut)}`);
    }
  }

  // Failed calls display a single-line red error continuation
  if (status === 'failed' || error) {
    const rawError = error || 'Operation failed';
    const firstLineErr = rawError.split('\n')[0]?.trim() || rawError;
    const maxErrLen = Math.max(10, fullTermWidth - 6);
    const truncatedErr =
      firstLineErr.length > maxErrLen ? `${firstLineErr.slice(0, maxErrLen - 1)}…` : firstLineErr;
    lines.push(`  ${chalk.dim('└ ')}${themeColor(theme.error)(truncatedErr)}`);
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
