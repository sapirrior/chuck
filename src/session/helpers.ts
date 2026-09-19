import type { SessionData } from './types.js';
import type { UIHistoryItem } from '../tui/types.js';
import type { SessionPresentationProjection } from './logs/types.js';

/**
 * Extracts full output or summary from tool execution outputs for terminal rendering.
 */
export function formatToolOutputSummary(res: unknown, isError = false): string | undefined {
  if (isError || res === undefined || res === null) {
    return undefined;
  }

  if (typeof res === 'object') {
    const obj = res as Record<string, any>;

    if (typeof obj.message === 'string' && obj.message.trim()) {
      return obj.message.trim();
    }
    if (obj.totalLines !== undefined && obj.startLine !== undefined && obj.endLine !== undefined) {
      return `Read ${obj.endLine - obj.startLine + 1} of ${obj.totalLines} lines`;
    }
    if (obj.totalEntries !== undefined) {
      return `Listed ${obj.totalEntries} entries`;
    }
    if (obj.totalMatches !== undefined && Array.isArray(obj.files)) {
      return `Found ${obj.totalMatches} files`;
    }
    if (obj.totalMatches !== undefined && Array.isArray(obj.matches)) {
      return `Found ${obj.totalMatches} matches`;
    }
    if (obj.resultCount !== undefined) {
      return `Found ${obj.resultCount} results`;
    }
    if (obj.url && obj.status) {
      return `Fetched ${obj.contentType ?? 'content'} (${obj.status} OK, ${obj.content?.length ?? 0} chars)`;
    }
    if (obj.linesWritten !== undefined && obj.path) {
      return `Wrote ${obj.linesWritten} lines to ${obj.path}`;
    }
    if (obj.replacements !== undefined && obj.path) {
      return `Updated ${obj.path}`;
    }
    if (obj.output !== undefined && typeof obj.output === 'string') {
      const trimmed = obj.output.trim();
      return trimmed || undefined;
    }
    if (obj.stdout !== undefined || obj.stderr !== undefined) {
      const combined = [obj.stdout, obj.stderr].filter(Boolean).join('\n').trim();
      return combined || undefined;
    }
    if (obj.content !== undefined) {
      if (typeof obj.content === 'string') {
        const trimmed = obj.content.trim();
        return trimmed || undefined;
      }
    }
    return undefined;
  }

  if (typeof res === 'string') {
    const trimmed = res.trim();
    if (!trimmed) return undefined;

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        const extracted = formatToolOutputSummary(parsed, isError);
        if (extracted) return extracted;
      } catch {}
    }
    return trimmed;
  }

  return undefined;
}

/**
 * Converts stored SessionData turns into UIHistoryItem list for restored sessions.
 * Derived from canonical ModelMessage[] history, optionally augmented with presentation journal metadata.
 */
export function rehydrateSessionHistory(
  sessionData: SessionData,
  projection?: SessionPresentationProjection | null,
): UIHistoryItem[] {
  const restoredItems: UIHistoryItem[] = [];

  for (const turn of sessionData.turns) {
    if (!turn.messages || turn.messages.length === 0) continue;

    const turnPresentation = projection?.turns.get(turn.id);
    const toolCallsMap = new Map<
      string,
      {
        id: string;
        name: string;
        args: Record<string, unknown>;
        result?: unknown;
        isError: boolean;
      }
    >();

    for (const msg of turn.messages) {
      if (msg.role === 'user') {
        const userText =
          typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content
                  .filter((p: any) => p.type === 'text')
                  .map((p: any) => p.text)
                  .join('\n')
              : '';
        if (userText.trim()) {
          restoredItems.push({
            id: `u-${turn.id}-${restoredItems.length}`,
            turnId: turn.id,
            type: 'user',
            content: userText.trim(),
          });
        }
      } else if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          if (msg.content.trim()) {
            restoredItems.push({
              id: `a-${turn.id}-${restoredItems.length}`,
              turnId: turn.id,
              type: 'assistant',
              content: msg.content.trim(),
            });
          }
        } else if (Array.isArray(msg.content)) {
          let textAccum = '';

          for (const part of msg.content) {
            if (part.type === 'text') {
              textAccum += (textAccum ? '\n' : '') + part.text;
            } else if (part.type === 'tool-call') {
              toolCallsMap.set(part.toolCallId, {
                id: part.toolCallId,
                name: part.toolName,
                args: (part.input as Record<string, unknown>) ?? {},
                isError: false,
              });
            }
          }

          if (textAccum.trim()) {
            restoredItems.push({
              id: `a-${turn.id}-${restoredItems.length}`,
              turnId: turn.id,
              type: 'assistant',
              content: textAccum.trim(),
            });
          }
        }
      } else if (msg.role === 'tool') {
        if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'tool-result') {
              const existing = toolCallsMap.get(part.toolCallId);
              const isError = Boolean(part.isError);
              const toolName = existing?.name ?? part.toolName ?? 'tool';
              const argsSummary = existing?.args ? JSON.stringify(existing.args) : '';
              const canonicalOutputSummary = formatToolOutputSummary(part.output, isError);

              const toolLog = turnPresentation?.tools.get(part.toolCallId);

              const status = toolLog
                ? toolLog.status === 'failed'
                  ? 'failed'
                  : 'completed'
                : isError
                  ? 'failed'
                  : 'completed';

              const error = toolLog?.errorMessage
                ? toolLog.errorMessage
                : isError
                  ? typeof part.output === 'object' && part.output !== null
                    ? ((part.output as any).message ?? JSON.stringify(part.output))
                    : String(part.output)
                  : undefined;

              const toolOutput = toolLog?.outputSummary ?? canonicalOutputSummary;

              restoredItems.push({
                id: `tool-${part.toolCallId}`,
                turnId: turn.id,
                type: 'tool',
                content: '',
                toolData: {
                  toolName,
                  displayName: toolLog?.displayName,
                  icon: toolLog?.icon,
                  argsSummary,
                  status,
                  durationMs: toolLog?.durationMs,
                  error,
                  toolOutput,
                },
              });
            }
          }
        }
      }
    }
  }

  return restoredItems;
}

/**
 * Pure helper to merge session presentation projection into canonical history items.
 */
export function mergeSessionPresentation(
  sessionData: SessionData,
  canonicalItems: UIHistoryItem[],
  projection: SessionPresentationProjection | null,
): UIHistoryItem[] {
  if (!projection) return canonicalItems;
  return rehydrateSessionHistory(sessionData, projection);
}
