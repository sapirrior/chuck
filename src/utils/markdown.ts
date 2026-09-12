import chalk from 'chalk';
import { marked, type Token, type Tokens } from 'marked';
import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';
import { highlight as cliHighlight, supportsLanguage } from 'cli-highlight';
import { getTheme } from '../theme/index.js';

const EOL = '\n';

/**
 * Converts a theme color string (rgb(...) or #hex) into a chalk colorizer function.
 */
function themeColor(color: string) {
  if (color.startsWith('rgb(')) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      return chalk.rgb(Number(match[0]), Number(match[1]), Number(match[2]));
    }
  }
  return chalk.hex(color);
}

let markedConfigured = false;

export function configureMarked(): void {
  if (markedConfigured) return;
  markedConfigured = true;

  marked.use({
    tokenizer: {
      del() {
        return undefined; // Disable strikethrough for ~100
      },
    },
  });
}

function padAligned(
  content: string,
  contentWidth: number,
  columnWidth: number,
  align?: 'left' | 'center' | 'right' | null,
): string {
  const padding = Math.max(0, columnWidth - contentWidth);
  if (align === 'right') {
    return ' '.repeat(padding) + content;
  }
  if (align === 'center') {
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + content + ' '.repeat(rightPad);
  }
  return content + ' '.repeat(padding);
}

/**
 * Token Formatter
 */
export function formatToken(
  token: Token,
  listDepth = 0,
  orderedListNumber: number | null = null,
  parent: Token | null = null,
): string {
  const theme = getTheme();

  switch (token.type) {
    case 'blockquote': {
      const inner = (token.tokens ?? []).map((t) => formatToken(t, 0, null, null)).join('');
      const bar = themeColor(theme.subtle)('│');
      return inner
        .split(EOL)
        .map((line) => (stripAnsi(line).trim() ? `${bar} ${chalk.italic(line)}` : line))
        .join(EOL);
    }

    case 'code': {
      const code = token as Tokens.Code;
      let highlighted = code.text;
      if (code.lang && supportsLanguage(code.lang)) {
        try {
          highlighted = cliHighlight(code.text, { language: code.lang, ignoreIllegals: true });
        } catch {}
      }
      const gutter = themeColor(theme.subtle)('│');
      const lines = highlighted.split(EOL);
      const formatted = lines.map((line) => `  ${gutter} ${line}`).join(EOL);
      return formatted + EOL + EOL;
    }

    case 'codespan': {
      return themeColor(theme.permission)(token.text);
    }

    case 'em': {
      return chalk.italic(
        (token.tokens ?? []).map((t) => formatToken(t, 0, null, parent)).join(''),
      );
    }

    case 'strong': {
      return chalk.bold((token.tokens ?? []).map((t) => formatToken(t, 0, null, parent)).join(''));
    }

    case 'heading': {
      const heading = token as Tokens.Heading;
      const text = (heading.tokens ?? []).map((t) => formatToken(t, 0, null, null)).join('');
      if (heading.depth === 1) {
        return themeColor(theme.brand).bold.underline(text) + EOL + EOL;
      }
      if (heading.depth === 2) {
        return themeColor(theme.brand).bold(text) + EOL + EOL;
      }
      return chalk.bold(text) + EOL + EOL;
    }

    case 'hr': {
      return themeColor(theme.dashedRule)('─'.repeat(40)) + EOL + EOL;
    }

    case 'link': {
      const link = token as Tokens.Link;
      const linkText = (link.tokens ?? []).map((t) => formatToken(t, 0, null, link)).join('');
      return linkText ? `${themeColor(theme.info)(linkText)} (${chalk.dim(link.href)})` : link.href;
    }

    case 'list': {
      const list = token as Tokens.List;
      return (
        list.items
          .map((item: Token, index: number) =>
            formatToken(item, listDepth, list.ordered ? (list.start || 1) + index : null, list),
          )
          .join('') + EOL
      );
    }

    case 'list_item': {
      const item = token as Tokens.ListItem;
      const indent = '  '.repeat(listDepth);
      const prefix = orderedListNumber !== null ? `${orderedListNumber}.` : '•';
      const nonListTokens = item.tokens?.filter((t) => t.type !== 'list') ?? [];
      const listTokens = item.tokens?.filter((t) => t.type === 'list') ?? [];
      const mainContent = nonListTokens
        .map((t) => formatToken(t, listDepth + 1, orderedListNumber, token))
        .join('')
        .trim();
      const nestedLists = listTokens
        .map((t) => formatToken(t, listDepth + 1, null, token))
        .join('');
      return `${indent}${themeColor(theme.brand)(prefix)} ${mainContent}${EOL}${nestedLists}`;
    }

    case 'paragraph': {
      return (token.tokens ?? []).map((t) => formatToken(t, 0, null, null)).join('') + EOL + EOL;
    }

    case 'space':
    case 'br': {
      return EOL;
    }

    case 'text': {
      if (token.tokens && token.tokens.length > 0) {
        return token.tokens
          .map((t) => formatToken(t, listDepth, orderedListNumber, token))
          .join('');
      }
      return token.text;
    }

    case 'table': {
      const tableToken = token as Tokens.Table;

      function getDisplayText(tokens: Token[] | undefined): string {
        return stripAnsi(tokens?.map((t) => formatToken(t, 0, null, null)).join('') ?? '');
      }

      const columnWidths = tableToken.header.map((header, index) => {
        let maxWidth = stringWidth(getDisplayText(header.tokens));
        for (const row of tableToken.rows) {
          const cellLength = stringWidth(getDisplayText(row[index]?.tokens));
          maxWidth = Math.max(maxWidth, cellLength);
        }
        return Math.max(maxWidth, 3);
      });

      const D = themeColor(theme.subtle);
      const hbar = (w: number) => '─'.repeat(w + 2);

      const topBorder = D('┌') + columnWidths.map((w) => D(hbar(w))).join(D('┬')) + D('┐');
      const midBorder = D('├') + columnWidths.map((w) => D(hbar(w))).join(D('┼')) + D('┤');
      const botBorder = D('└') + columnWidths.map((w) => D(hbar(w))).join(D('┴')) + D('┘');

      function formatRow(cells: Array<{ tokens?: Token[] }>, isHeader: boolean): string {
        const parts = columnWidths.map((w, i) => {
          const cell = cells[i];
          const raw = cell?.tokens
            ? cell.tokens.map((t) => formatToken(t, 0, null, null)).join('')
            : '';
          const plain = stripAnsi(raw);
          const align = isHeader ? 'center' : (tableToken.align?.[i] ?? 'left');
          const padded = padAligned(raw, stringWidth(plain), w, align);
          return isHeader ? ` ${chalk.bold(padded)} ` : ` ${padded} `;
        });
        return D('│') + parts.join(D('│')) + D('│');
      }

      const lines: string[] = [];
      lines.push(topBorder);
      lines.push(formatRow(tableToken.header, true));
      lines.push(midBorder);

      tableToken.rows.forEach((row, rIdx) => {
        lines.push(formatRow(row, false));
        if (rIdx < tableToken.rows.length - 1) {
          lines.push(midBorder);
        }
      });

      lines.push(botBorder);
      return lines.join(EOL) + EOL + EOL;
    }

    default: {
      return 'text' in token ? (token as any).text : '';
    }
  }
}

/**
 * Markdown Renderer
 */
export function applyMarkdown(content: string): string {
  if (!content) return '';

  configureMarked();
  const tokens = marked.lexer(content);
  return tokens
    .map((t) => formatToken(t))
    .join('')
    .trimEnd();
}
