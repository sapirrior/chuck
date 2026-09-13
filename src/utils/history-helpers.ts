import { randomUUID } from 'node:crypto';
import type { UIHistoryItem } from '../tui/types.js';
import type { SessionData } from '../session/types.js';

/**
 * Extracts full output or summary from tool execution outputs for terminal rendering.
 */
export function formatToolOutputSummary(res: unknown, isError = false): string | undefined {
  if (isError || res === undefined || res === null) {
    return undefined;
  }

  if (typeof res === 'object') {
    const obj = res as Record<string, any>;
    if (obj.output !== undefined && typeof obj.output === 'string') {
      const trimmed = obj.output.trim();
      return trimmed || '(no content)';
    }
    if (obj.stdout !== undefined || obj.stderr !== undefined) {
      const combined = [obj.stdout, obj.stderr].filter(Boolean).join('\n').trim();
      return combined || '(no content)';
    }
    if (obj.message && typeof obj.message === 'string') {
      return obj.message;
    }
    if (obj.totalLines !== undefined && obj.startLine !== undefined && obj.endLine !== undefined) {
      return `Read ${obj.endLine - obj.startLine + 1} of ${obj.totalLines} lines`;
    }
    if (obj.url && obj.status) {
      return `Fetched ${obj.contentType ?? 'content'} (${obj.status} OK, ${obj.content?.length ?? 0} chars)`;
    }
    if (obj.content !== undefined) {
      if (typeof obj.content === 'string') {
        const trimmed = obj.content.trim();
        return trimmed || '(no content)';
      }
      return JSON.stringify(obj.content);
    }
  }

  if (typeof res === 'string') {
    const trimmed = res.trim();
    return trimmed || '(no content)';
  }

  return undefined;
}

/**
 * Converts stored SessionData turns into UIHistoryItem list for restored sessions.
 */
export function rehydrateSessionHistory(sessionData: SessionData): UIHistoryItem[] {
  const restoredItems: UIHistoryItem[] = [];

  for (const turn of sessionData.turns) {
    if (turn.userPrompt) {
      restoredItems.push({
        id: `u-${turn.id}`,
        type: 'user',
        content: turn.userPrompt,
      });
    }
    if (turn.toolCalls && turn.toolCalls.length > 0) {
      for (const tc of turn.toolCalls) {
        const resObj =
          typeof tc.result === 'object' && tc.result !== null ? (tc.result as any) : undefined;
        let previewLines: string[] | undefined = undefined;
        let totalLines: number | undefined = resObj?.totalLines;

        if (Array.isArray(resObj?.previewLines)) {
          previewLines = resObj.previewLines;
          totalLines = totalLines ?? resObj?.previewLines.length;
        } else if (resObj?.output || resObj?.stdout || resObj?.stderr) {
          const combined = [resObj.output, resObj.stdout, resObj.stderr]
            .filter(Boolean)
            .join('\n')
            .trim();
          if (combined) {
            const outLines = combined.split(/\r?\n/);
            previewLines = outLines;
            totalLines = totalLines ?? outLines.length;
          }
        } else if (Array.isArray(resObj?.recentLines)) {
          previewLines = resObj.recentLines;
          totalLines = totalLines ?? resObj?.recentLines.length;
        }

        restoredItems.push({
          id: `tool-${tc.id}`,
          type: 'tool',
          content: '',
          toolData: {
            toolName: tc.name,
            argsSummary: JSON.stringify(tc.args),
            status: tc.isError ? 'failed' : 'completed',
            error: tc.isError
              ? typeof tc.result === 'object' && tc.result !== null
                ? ((tc.result as any).message ?? JSON.stringify(tc.result))
                : String(tc.result)
              : undefined,
            toolOutput: formatToolOutputSummary(tc.result, tc.isError),
            previewLines,
            diffLines: Array.isArray(resObj?.diffLines) ? resObj.diffLines : undefined,
            highlightLineIndex: resObj?.highlightLineIndex,
            highlightCount: resObj?.highlightCount,
            totalLines: resObj?.totalLines,
          },
        });
      }
    }
    if (turn.reasoning) {
      restoredItems.push({
        id: `res-reasoning-${turn.id}`,
        type: 'reasoning',
        content: turn.reasoning,
      });
    }
    if (turn.assistantText) {
      restoredItems.push({
        id: `res-text-${turn.id}`,
        type: 'assistant',
        content: turn.assistantText,
      });
    }
  }

  return restoredItems;
}
