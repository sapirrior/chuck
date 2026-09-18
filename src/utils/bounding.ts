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
