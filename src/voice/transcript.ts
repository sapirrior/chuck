import type { TranscriptEvent } from './types.js';

/**
 * Accumulates real-time transcription events into finalized and interim segments.
 * Prevents text duplication between streaming hypothesis revisions and final tokens.
 */
export class TranscriptAccumulator {
  private finalSegments: string[] = [];
  private interimSegment = '';

  /**
   * Processes an incoming transcription event.
   * Returns the current full visible transcript.
   */
  public addEvent(event: TranscriptEvent): string {
    const rawText = event.text ?? '';
    const trimmed = rawText.trim();

    if (!trimmed) {
      return this.getVisibleText();
    }

    if (event.isFinal) {
      this.finalSegments.push(trimmed);
      this.interimSegment = '';
    } else {
      this.interimSegment = trimmed;
    }

    return this.getVisibleText();
  }

  /**
   * Returns the combined visible text for live display.
   */
  public getVisibleText(): string {
    const finals = this.finalSegments.join(' ').trim();
    if (!this.interimSegment) {
      return finals;
    }
    if (!finals) {
      return this.interimSegment;
    }
    return `${finals} ${this.interimSegment}`;
  }

  /**
   * Finalizes the accumulated transcript when recording finishes or on early termination.
   * Merges finalized segments and any trailing interim hypothesis.
   */
  public getFinalizedText(): string {
    const visible = this.getVisibleText();
    // Normalize excessive consecutive spaces while preserving all punctuation, case, symbols
    return visible.replace(/[ \t]+/g, ' ').trim();
  }

  /**
   * Returns true if any transcription content has been accumulated.
   */
  public get hasContent(): boolean {
    return this.finalSegments.length > 0 || this.interimSegment.length > 0;
  }

  /**
   * Resets all accumulated segments.
   */
  public clear(): void {
    this.finalSegments = [];
    this.interimSegment = '';
  }
}
