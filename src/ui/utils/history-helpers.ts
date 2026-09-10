import { randomUUID } from 'node:crypto';
import type { UIHistoryItem } from '../components/message-history.js';
import type { SessionData } from '../../session/types.js';

/**
 * Extracts human-friendly one-line summary from tool execution outputs.
 */
export function formatToolOutputSummary(res: unknown, isError = false): string | undefined {
  if (isError || res === undefined || res === null) {
    return undefined;
  }

  if (typeof res === 'object') {
    const obj = res as Record<string, any>;
    if (obj.stdout !== undefined || obj.stderr !== undefined) {
      const combined = ((obj.stdout ?? '') + (obj.stderr ? ` ${obj.stderr}` : '')).trim();
      if (!combined) {
        return '(no content)';
      }
      return combined.split('\n')[0];
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
        return trimmed ? trimmed.split('\n')[0] : '(no content)';
      }
      return JSON.stringify(obj.content);
    }
  }

  if (typeof res === 'string') {
    const trimmed = res.trim();
    return trimmed ? trimmed.split('\n')[0] : '(no content)';
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
        restoredItems.push({
          id: `tool-${tc.id}`,
          type: 'tool',
          content: '',
          toolData: {
            toolName: tc.name,
            argsSummary: JSON.stringify(tc.args),
            status: tc.isError ? 'failed' : 'completed',
            error: tc.isError ? String(tc.result) : undefined,
            toolOutput: formatToolOutputSummary(tc.result, tc.isError),
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

  restoredItems.push({
    id: `sys-resume-${randomUUID()}`,
    type: 'system',
    content: `Resumed session ${sessionData.id.slice(0, 8)} (${sessionData.turns.length} turns, ${sessionData.totalUsage?.totalTokens ?? 0} tokens)`,
  });

  return restoredItems;
}
