import { extractToolResultPreview } from '../tools/bounding.js';
import {
  SESSION_SCHEMA_VERSION,
  type SessionDocumentV2,
  type SessionTurnV2,
  type ToolCallSummary,
} from './schema.js';

/**
 * Migrates a raw session document (e.g. legacy v1) into a canonical SessionDocumentV2.
 */
export function migrateSessionDocument(raw: any): SessionDocumentV2 {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid session document: expected an object');
  }

  // If already v2, return as-is
  if (raw.schemaVersion === SESSION_SCHEMA_VERSION) {
    return raw as SessionDocumentV2;
  }

  const now = new Date().toISOString();
  const turns: SessionTurnV2[] = (raw.turns || []).map((t: any): SessionTurnV2 => {
    const hasRawMessages = Array.isArray(t.rawMessages) && t.rawMessages.length > 0;
    const messages = hasRawMessages ? t.rawMessages : [];
    const status: 'complete' | 'interrupted' | 'errored' =
      t.status || (hasRawMessages ? 'complete' : 'interrupted');

    const toolCallSummaries: ToolCallSummary[] = (t.toolCalls || []).map((tc: any): ToolCallSummary => {
      const { resultPreview, resultTruncated } = extractToolResultPreview(tc.result);
      let argsSummary = '';
      try {
        argsSummary = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args ?? {});
      } catch {
        argsSummary = String(tc.args ?? '');
      }
      if (argsSummary.length > 80) {
        argsSummary = argsSummary.slice(0, 80) + '...';
      }

      return {
        id: tc.id || '',
        name: tc.name || '',
        status: tc.isError ? 'failed' : 'completed',
        argsSummary,
        durationMs: tc.durationMs,
        isError: Boolean(tc.isError),
        resultPreview,
        resultTruncated,
      };
    });

    return {
      id: t.id || '',
      timestamp: t.timestamp || now,
      status,
      userPrompt: t.userPrompt || '',
      assistantText: t.assistantText || '',
      reasoning: t.reasoning,
      usage: t.usage || {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      messages,
      toolCallSummaries,
    };
  });

  return {
    schemaVersion: 2,
    id: raw.id || '',
    name: raw.name || 'Untitled Session',
    date: raw.date || now.split('T')[0] || '',
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    model: raw.model || { provider: 'anthropic', modelId: 'claude-3-7-sonnet' },
    totalUsage: raw.totalUsage || {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    turns,
  };
}
