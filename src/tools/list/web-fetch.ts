import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const webFetchInputSchema = z.object({
  url: z.string().url().describe('The HTTP or HTTPS URL to fetch content from.'),
  maxCharacters: z
    .number()
    .int()
    .min(500)
    .max(50000)
    .optional()
    .describe('Maximum number of characters to extract from the content. Defaults to 12000.'),
});

export type WebFetchInput = z.infer<typeof webFetchInputSchema>;

export interface WebFetchOutput {
  url: string;
  status: number;
  contentType: string;
  content: string;
  isTruncated: boolean;
}

/**
 * Basic HTML to clean text converter that strips non-content tags and reduces whitespace.
 */
function cleanHtmlContent(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

export const webFetchTool: ToolDefinition<typeof webFetchInputSchema, WebFetchOutput> = {
  name: 'web_fetch',
  displayName: 'Web Fetch',
  description:
    'Fetches text and documentation content from a public web URL. Automatically cleans HTML markup into readable text.',
  parameters: webFetchInputSchema,
  confirmationPolicy: 'never',

  summarize: (args) => {
    return `web_fetch(${args.url})`;
  },

  execute: async (args, context) => {
    const maxChars = args.maxCharacters ?? 12000;
    const timeoutSignal = AbortSignal.timeout(15000);

    const signal = context.abortSignal
      ? AbortSignal.any([context.abortSignal, timeoutSignal])
      : timeoutSignal;

    const response = await fetch(args.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'xd-agent/0.1.0 (terminal AI agent; +https://github.com/sapirrior/xd)',
        Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP fetch failed with status ${response.status} (${response.statusText})`);
    }

    const contentType = response.headers.get('content-type') || 'text/plain';
    const rawText = await response.text();

    let cleanText: string;
    if (contentType.includes('text/html') || rawText.includes('<html')) {
      cleanText = cleanHtmlContent(rawText);
    } else {
      cleanText = rawText.trim();
    }

    const isTruncated = cleanText.length > maxChars;
    const content = isTruncated
      ? cleanText.slice(0, maxChars) + '\n\n[...content truncated]'
      : cleanText;

    return {
      url: args.url,
      status: response.status,
      contentType,
      content,
      isTruncated,
    };
  },
};
