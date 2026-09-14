export const RESULT_PREVIEW_MAX_CHARS = 4000;
export const RESULT_PREVIEW_MAX_LINES = 200;

export interface BoundedResult {
  preview: string;
  truncated: boolean;
}

/**
 * Bounds text content to maximum character and line limits.
 */
export function boundResultText(text: string): BoundedResult {
  if (!text) {
    return { preview: '', truncated: false };
  }

  let truncated = false;
  let lines = text.split(/\r?\n/);

  if (lines.length > RESULT_PREVIEW_MAX_LINES) {
    lines = lines.slice(0, RESULT_PREVIEW_MAX_LINES);
    truncated = true;
  }

  let preview = lines.join('\n');
  if (preview.length > RESULT_PREVIEW_MAX_CHARS) {
    preview = preview.slice(0, RESULT_PREVIEW_MAX_CHARS);
    truncated = true;
  }

  if (text.length > RESULT_PREVIEW_MAX_CHARS) {
    truncated = true;
  }

  return { preview, truncated };
}

/**
 * Extracts and bounds a clean string preview or summary from arbitrary tool output.
 * Produces clean human-readable summaries rather than raw JSON serialization.
 */
export function extractToolResultPreview(res: unknown): {
  resultPreview?: string;
  resultTruncated: boolean;
} {
  if (res === undefined || res === null) {
    return { resultPreview: undefined, resultTruncated: false };
  }

  if (typeof res === 'string') {
    const trimmed = res.trim();
    const { preview, truncated } = boundResultText(trimmed);
    return { resultPreview: preview || undefined, resultTruncated: truncated };
  }

  if (typeof res === 'object') {
    const obj = res as Record<string, any>;

    if (typeof obj.message === 'string' && obj.message.trim()) {
      return { resultPreview: obj.message.trim(), resultTruncated: false };
    }

    if (obj.totalLines !== undefined && obj.startLine !== undefined && obj.endLine !== undefined) {
      return {
        resultPreview: `Read ${obj.endLine - obj.startLine + 1} of ${obj.totalLines} lines`,
        resultTruncated: false,
      };
    }

    if (obj.totalEntries !== undefined) {
      return {
        resultPreview: `Listed ${obj.totalEntries} entries`,
        resultTruncated: false,
      };
    }

    if (obj.totalMatches !== undefined && Array.isArray(obj.files)) {
      return {
        resultPreview: `Found ${obj.totalMatches} files`,
        resultTruncated: false,
      };
    }

    if (obj.totalMatches !== undefined && Array.isArray(obj.matches)) {
      return {
        resultPreview: `Found ${obj.totalMatches} matches`,
        resultTruncated: false,
      };
    }

    if (obj.resultCount !== undefined) {
      return {
        resultPreview: `Found ${obj.resultCount} results`,
        resultTruncated: false,
      };
    }

    if (obj.url && obj.status) {
      return {
        resultPreview: `Fetched ${obj.contentType ?? 'content'} (${obj.status} OK, ${obj.content?.length ?? 0} chars)`,
        resultTruncated: false,
      };
    }

    if (obj.linesWritten !== undefined && obj.path) {
      return {
        resultPreview: `Wrote ${obj.linesWritten} lines to ${obj.path}`,
        resultTruncated: false,
      };
    }

    if (obj.replacements !== undefined && obj.path) {
      return {
        resultPreview: `Updated ${obj.path}`,
        resultTruncated: false,
      };
    }

    if (typeof obj.output === 'string' && obj.output.trim()) {
      const { preview, truncated } = boundResultText(obj.output.trim());
      return { resultPreview: preview, resultTruncated: truncated };
    }

    if (obj.stdout !== undefined || obj.stderr !== undefined) {
      const combined = [obj.stdout, obj.stderr].filter(Boolean).join('\n').trim();
      if (combined) {
        const { preview, truncated } = boundResultText(combined);
        return { resultPreview: preview, resultTruncated: truncated };
      }
      return { resultPreview: undefined, resultTruncated: false };
    }

    if (obj.content !== undefined) {
      const str = typeof obj.content === 'string' ? obj.content.trim() : '';
      if (str) {
        const { preview, truncated } = boundResultText(str);
        return { resultPreview: preview, resultTruncated: truncated };
      }
    }

    return { resultPreview: undefined, resultTruncated: false };
  }

  const { preview, truncated } = boundResultText(String(res));
  return { resultPreview: preview || undefined, resultTruncated: truncated };
}
