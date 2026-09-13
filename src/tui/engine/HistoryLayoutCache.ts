import type { PhysicalRow } from './cell-layout.js';

export interface CachedEntryLayout {
  entryId: string;
  width: number;
  physicalRows: PhysicalRow[];
  rowCount: number;
}

/**
 * Cache for immutable committed history entry layouts.
 * Keyed by `${entryId}:${width}`.
 */
export class HistoryLayoutCache {
  private cache = new Map<string, CachedEntryLayout>();

  public getOrCompute(
    entryId: string,
    width: number,
    compute: () => PhysicalRow[],
  ): CachedEntryLayout {
    const key = `${entryId}:${width}`;
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    const physicalRows = compute();
    const result: CachedEntryLayout = {
      entryId,
      width,
      physicalRows,
      rowCount: physicalRows.length,
    };
    this.cache.set(key, result);
    return result;
  }

  public invalidateWidth(width: number): void {
    for (const key of this.cache.keys()) {
      if (key.endsWith(`:${width}`)) {
        this.cache.delete(key);
      }
    }
  }

  public clear(): void {
    this.cache.clear();
  }
}

export const historyLayoutCache = new HistoryLayoutCache();
