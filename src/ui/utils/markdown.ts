import chalk from 'chalk';
import { marked, type Token, type Tokens } from 'marked';
import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';
import { highlight as cliHighlight, supportsLanguage } from 'cli-highlight';

const EOL = '\n';

// Claude Code specific glyphs and colors
const BRAND_HEX = '#D77757';       // Coral / Terracotta (Headings, Bullets)
const PERMISSION_HEX = '#B1B9F9';  // Lavender / Code Span
const INFO_HEX = '#7BA5DA';        // Link Blue
const DIM_BAR_HEX = '#505050';     // Gutter bars
const RULE_HEX = '#333333';        // Table / HR lines

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
 * 1:1 Claude Code Token Formatter
 */
export function formatToken(
  token: Token,
  listDepth = 0,
  orderedListNumber: number | null = null,
  parent: Token | null = null,
): string {
  switch (token.type) {
    case 'blockquote': {
      const inner = (token.tokens ?? [])
        .map((t) => formatToken(t, 0, null, null))
        .join('');
      const bar = chalk.hex(DIM_BAR_HEX)('│');
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
      return highlighted + EOL + EOL;
    }

    case 'codespan': {
      return chalk.hex(PERMISSION_HEX)(token.text);
    }

    case 'em': {
      return chalk.italic(
        (token.tokens ?? []).map((t) => formatToken(t, 0, null, parent)).join(''),
      );
    }

    case 'strong': {
      return chalk.bold(
        (token.tokens ?? []).map((t) => formatToken(t, 0, null, parent)).join(''),
      );
    }

    case 'heading': {
      const heading = token as Tokens.Heading;
      const text = (heading.tokens ?? []).map((t) => formatToken(t, 0, null, null)).join('');
      if (heading.depth === 1) {
        return chalk.hex(BRAND_HEX).bold.underline(text) + EOL + EOL;
      }
      if (heading.depth === 2) {
        return chalk.hex(BRAND_HEX).bold(text) + EOL + EOL;
      }
      return chalk.bold(text) + EOL + EOL;
    }

    case 'hr': {
      return chalk.hex(RULE_HEX)('─'.repeat(40)) + EOL + EOL;
    }

    case 'link': {
      const link = token as Tokens.Link;
      const linkText = (link.tokens ?? []).map((t) => formatToken(t, 0, null, link)).join('');
      return linkText ? `${chalk.hex(INFO_HEX)(linkText)} (${chalk.dim(link.href)})` : link.href;
    }

    case 'list': {
      const list = token as Tokens.List;
      return (
        list.items
          .map((item: Token, index: number) =>
            formatToken(
              item,
              listDepth,
              list.ordered ? (list.start || 1) + index : null,
              list,
            ),
          )
          .join('') + EOL
      );
    }

    case 'list_item': {
      const item = token as Tokens.ListItem;
      const indent = '  '.repeat(listDepth);
      const prefix = orderedListNumber !== null ? `${orderedListNumber}.` : '•';
      const inner = (item.tokens ?? [])
        .map((t) => formatToken(t, listDepth + 1, orderedListNumber, token))
        .join('');
      return `${indent}${chalk.hex(BRAND_HEX)(prefix)} ${inner.trim()}${EOL}`;
    }

    case 'paragraph': {
      return (
        (token.tokens ?? []).map((t) => formatToken(t, 0, null, null)).join('') + EOL + EOL
      );
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
        return stripAnsi(
          tokens?.map((t) => formatToken(t, 0, null, null)).join('') ?? '',
        );
      }

      const columnWidths = tableToken.header.map((header, index) => {
        let maxWidth = stringWidth(getDisplayText(header.tokens));
        for (const row of tableToken.rows) {
          const cellLength = stringWidth(getDisplayText(row[index]?.tokens));
          maxWidth = Math.max(maxWidth, cellLength);
        }
        return Math.max(maxWidth, 3);
      });

      const D = chalk.hex(DIM_BAR_HEX);
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
          const align = isHeader ? 'center' : tableToken.align?.[i] ?? 'left';
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
 * 1:1 Claude Code Markdown Renderer
 */
export function applyMarkdown(content: string): string {
  if (!content) return '';

  configureMarked();
  const tokens = marked.lexer(content);
  return tokens.map((t) => formatToken(t)).join('').trimEnd();
}
