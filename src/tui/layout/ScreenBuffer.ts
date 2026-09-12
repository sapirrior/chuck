import stringWidth from 'string-width';

export interface ScreenCell {
  char: string;
  style: string;
  width: number;
}

export class ScreenBuffer {
  readonly width: number;
  readonly height: number;
  private grid: ScreenCell[][];

  constructor(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.grid = [];
    this.clear();
  }

  clear(): void {
    this.grid = [];
    for (let y = 0; y < this.height; y++) {
      const row: ScreenCell[] = [];
      for (let x = 0; x < this.width; x++) {
        row.push({ char: ' ', style: '', width: 1 });
      }
      this.grid.push(row);
    }
  }

  blitText(x: number, y: number, maxWidth: number, styledText: string): void {
    if (y < 0 || y >= this.height || x >= this.width || maxWidth <= 0 || !styledText) {
      return;
    }

    const row = this.grid[y];
    if (!row) return;

    const availableCols = Math.min(maxWidth, this.width - x);
    if (availableCols <= 0) return;

    // Tokenize ANSI sequences and characters while tracking style state
    const ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]/g;
    let activeFg: string | null = null;
    let activeBg: string | null = null;
    const activeModifiers = new Set<string>();

    function updateStyles(seq: string) {
      const match = seq.match(/^\x1b\[([0-9;]*)m$/);
      if (!match) return;
      const rawParams = match[1] || '0';
      const params = rawParams.split(';').map((p) => parseInt(p, 10) || 0);

      let i = 0;
      while (i < params.length) {
        const code = params[i] ?? 0;
        if (code === 0) {
          activeFg = null;
          activeBg = null;
          activeModifiers.clear();
        } else if (
          code === 1 ||
          code === 2 ||
          code === 3 ||
          code === 4 ||
          code === 7 ||
          code === 8 ||
          code === 9
        ) {
          activeModifiers.add(`\x1b[${code}m`);
        } else if (code === 22) {
          activeModifiers.delete('\x1b[1m');
          activeModifiers.delete('\x1b[2m');
        } else if (code === 23) {
          activeModifiers.delete('\x1b[3m');
        } else if (code === 24) {
          activeModifiers.delete('\x1b[4m');
        } else if (code === 27) {
          activeModifiers.delete('\x1b[7m');
        } else if (code === 28) {
          activeModifiers.delete('\x1b[8m');
        } else if (code === 29) {
          activeModifiers.delete('\x1b[9m');
        } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
          activeFg = `\x1b[${code}m`;
        } else if (code === 38) {
          if (params[i + 1] === 5 && i + 2 < params.length) {
            activeFg = `\x1b[38;5;${params[i + 2]}m`;
            i += 2;
          } else if (params[i + 1] === 2 && i + 4 < params.length) {
            activeFg = `\x1b[38;2;${params[i + 2]};${params[i + 3]};${params[i + 4]}m`;
            i += 4;
          }
        } else if (code === 39) {
          activeFg = null;
        } else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
          activeBg = `\x1b[${code}m`;
        } else if (code === 48) {
          if (params[i + 1] === 5 && i + 2 < params.length) {
            activeBg = `\x1b[48;5;${params[i + 2]}m`;
            i += 2;
          } else if (params[i + 1] === 2 && i + 4 < params.length) {
            activeBg = `\x1b[48;2;${params[i + 2]};${params[i + 3]};${params[i + 4]}m`;
            i += 4;
          }
        } else if (code === 49) {
          activeBg = null;
        }
        i++;
      }
    }

    function getActiveStyleString(): string {
      let s = '';
      if (activeFg) s += activeFg;
      if (activeBg) s += activeBg;
      for (const mod of activeModifiers) {
        s += mod;
      }
      return s;
    }

    let col = 0;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    const processPlain = (plain: string) => {
      for (const char of plain) {
        if (col >= availableCols) return;
        const w = stringWidth(char);
        if (w === 0) continue;
        if (col + w > availableCols) return;

        const curStyle = getActiveStyleString();
        const targetX = x + col;
        row[targetX] = { char, style: curStyle, width: w };
        if (w === 2 && targetX + 1 < this.width) {
          row[targetX + 1] = { char: '', style: curStyle, width: 0 };
        }
        col += w;
      }
    };

    while ((match = ansiRegex.exec(styledText)) !== null) {
      if (match.index > lastIndex) {
        processPlain(styledText.slice(lastIndex, match.index));
        if (col >= availableCols) break;
      }
      updateStyles(match[0]);
      lastIndex = ansiRegex.lastIndex;
    }

    if (lastIndex < styledText.length && col < availableCols) {
      processPlain(styledText.slice(lastIndex));
    }
  }

  getRow(y: number): string {
    if (y < 0 || y >= this.height) return '';
    const row = this.grid[y];
    if (!row) return '';

    // Find the last non-space cell (or styled space) to avoid drawing unnecessary trailing spaces
    let lastUsedIndex = row.length - 1;
    while (lastUsedIndex >= 0) {
      const cell = row[lastUsedIndex]!;
      if (cell.char !== ' ' || cell.style !== '') {
        break;
      }
      lastUsedIndex--;
    }

    if (lastUsedIndex < 0) return '';

    let out = '';
    let currentStyle = '';

    for (let x = 0; x <= lastUsedIndex; x++) {
      const cell = row[x]!;
      if (cell.width === 0) continue; // continuation of wide character

      if (cell.style !== currentStyle) {
        if (currentStyle && !cell.style) {
          out += '\x1b[0m';
        } else if (cell.style) {
          if (currentStyle) {
            out += '\x1b[0m' + cell.style;
          } else {
            out += cell.style;
          }
        }
        currentStyle = cell.style;
      }
      out += cell.char;
    }

    if (currentStyle) {
      out += '\x1b[0m';
    }

    return out;
  }

  diff(prev: ScreenBuffer): Array<{ row: number; text: string }> {
    const changes: Array<{ row: number; text: string }> = [];
    const maxRows = Math.max(this.height, prev.height);

    for (let y = 0; y < maxRows; y++) {
      const currentLine = y < this.height ? this.getRow(y) : '';
      const prevLine = y < prev.height ? prev.getRow(y) : '';

      if (currentLine !== prevLine) {
        changes.push({ row: y, text: currentLine });
      }
    }

    return changes;
  }
}
