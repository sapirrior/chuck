import { randomUUID } from 'node:crypto';

export interface ReviewEntry {
  oldContent?: string;
  newContent?: string;
  fullText?: string;
  command?: string;
  timestamp: number;
}

/**
 * In-memory cache for full review content referenced by ConfirmationRequest.reviewToken.
 * Keeps memory bounded by evicting stale tokens (LRU or TTL).
 */
class ReviewTokenCache {
  private entries = new Map<string, ReviewEntry>();
  private readonly maxEntries = 50;
  private readonly ttlMs = 15 * 60 * 1000; // 15 minutes

  public register(data: Omit<ReviewEntry, 'timestamp'>): string {
    this.cleanup();
    const token = randomUUID();
    this.entries.set(token, {
      ...data,
      timestamp: Date.now(),
    });
    return token;
  }

  public get(token: string): ReviewEntry | undefined {
    return this.entries.get(token);
  }

  public evict(token: string): void {
    this.entries.delete(token);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [token, entry] of this.entries.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.entries.delete(token);
      }
    }
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest) {
        this.entries.delete(oldest);
      }
    }
  }
}

export const reviewTokenCache = new ReviewTokenCache();
