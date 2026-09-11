export interface HistoryEntry {
  id: string;
  kind:
    | 'log'
    | 'header'
    | 'footer'
    | 'tool-result'
    | 'assistant-message'
    | 'raw'
    | 'logo'
    | 'prompt'
    | 'system';
  lines: string[];
  createdAt: number;
}

export class HistoryStore {
  private entries: HistoryEntry[] = [];
  private idCounter = 0;

  /**
   * Commit a new block of static content. Immutable once pushed.
   */
  push(kind: HistoryEntry['kind'], lines: string[]): HistoryEntry {
    const entry: HistoryEntry = {
      id: `entry-${this.idCounter++}`,
      kind,
      lines: [...lines],
      createdAt: Date.now(),
    };
    this.entries.push(entry);
    return entry;
  }

  /**
   * Returns a copy of all entries.
   */
  getEntries(): HistoryEntry[] {
    return [...this.entries];
  }

  /**
   * Full reconstruction of all lines.
   */
  getAllLines(): string[] {
    return this.entries.flatMap((e) => e.lines);
  }

  /**
   * Returns lines for primary screen flush on exit if needed.
   */
  getPrimaryScreenLines(): string[] {
    return this.entries.filter((e) => e.kind !== 'logo').flatMap((e) => e.lines);
  }

  clearAll(): void {
    this.entries = [];
  }
}

export default HistoryStore;
