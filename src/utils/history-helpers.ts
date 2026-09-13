import type { SessionData } from '../session/types.js';
import type { UIHistoryItem } from '../tui/types.js';

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

    // Check if it's a stringified JSON object
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

    if (turn.toolCallSummaries && turn.toolCallSummaries.length > 0) {
      for (const tc of turn.toolCallSummaries) {
        let cleanOutput = tc.resultPreview;
        if (cleanOutput && cleanOutput.startsWith('{') && cleanOutput.endsWith('}')) {
          try {
            const parsed = JSON.parse(cleanOutput);
            cleanOutput = formatToolOutputSummary(parsed, tc.isError) ?? cleanOutput;
          } catch {}
        }

        const isMutatingTool =
          tc.name === 'edit_file' || tc.name === 'write_file' || tc.name === 'run_command';

        let previewLines: string[] | undefined = undefined;
        if (
          isMutatingTool &&
          tc.resultPreview &&
          !tc.resultPreview.startsWith('{') &&
          tc.resultPreview !== cleanOutput
        ) {
          previewLines = tc.resultPreview.split(/\r?\n/).filter(Boolean);
        }

        restoredItems.push({
          id: `tool-${tc.id}`,
          type: 'tool',
          content: '',
          toolData: {
            toolName: tc.name,
            argsSummary: tc.argsSummary,
            status: tc.status,
            error: tc.isError ? cleanOutput : undefined,
            toolOutput: cleanOutput,
            previewLines,
            totalLines: previewLines?.length,
          },
        });
      }
    } else if ((turn as any).toolCalls && (turn as any).toolCalls.length > 0) {
      for (const tc of (turn as any).toolCalls) {
        const resObj =
          typeof tc.result === 'object' && tc.result !== null ? (tc.result as any) : undefined;
        const isMutatingTool =
          tc.name === 'edit_file' || tc.name === 'write_file' || tc.name === 'run_command';

        let previewLines: string[] | undefined = undefined;
        let totalLines: number | undefined = undefined;

        if (isMutatingTool) {
          if (Array.isArray(resObj?.previewLines)) {
            previewLines = resObj.previewLines;
            totalLines = totalLines ?? resObj?.previewLines.length;
          } else if (resObj?.stdout || resObj?.stderr) {
            const combined = [resObj.stdout, resObj.stderr].filter(Boolean).join('\n').trim();
            if (combined) {
              previewLines = combined.split(/\r?\n/);
              totalLines = previewLines.length;
            }
          }
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
            diffLines:
              isMutatingTool && Array.isArray(resObj?.diffLines) ? resObj.diffLines : undefined,
            highlightLineIndex: isMutatingTool ? resObj?.highlightLineIndex : undefined,
            highlightCount: isMutatingTool ? resObj?.highlightCount : undefined,
            totalLines,
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
