import { z } from 'zod';
import pkg from '../../../package.json' with { type: 'json' };
import type { ToolDefinition } from '../types.js';

const VERSION: string = pkg.version || '0.0.0';

export const webSearchInputSchema = z.object({
  query: z.string().min(1).describe('The search query or keywords to look up on the web.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Maximum number of search results to return (default: 5, max: 20).'),
  site: z
    .string()
    .optional()
    .describe(
      'Optional domain to restrict search results to (e.g. "github.com", "docs.anthropic.com").',
    ),
});

export type WebSearchInput = z.infer<typeof webSearchInputSchema>;

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOutput {
  query: string;
  resultCount: number;
  results: WebSearchResultItem[];
  source: string;
}

/**
 * Strips HTML tags and decodes common HTML entities.
 */
function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves redirect URLs (such as DuckDuckGo's uddg redirects) to clean destination URLs.
 */
function extractCleanUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (url.startsWith('//')) {
    url = `https:${url}`;
  }
  if (url.includes('duckduckgo.com/l/?uddg=')) {
    try {
      const parsed = new URL(url);
      const uddg = parsed.searchParams.get('uddg');
      if (uddg) {
        return decodeURIComponent(uddg);
      }
    } catch {
      const match = url.match(/uddg=([^&]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  }
  return url;
}

/**
 * Searches DuckDuckGo HTML endpoint directly with clean browser headers.
 */
async function searchDuckDuckGoDirect(
  query: string,
  limit: number,
  signal: AbortSignal,
): Promise<WebSearchResultItem[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 (chuck-agent/${VERSION}; +https://github.com/sapirrior/chuck)`,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      Referer: 'https://html.duckduckgo.com/',
      DNT: '1',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo returned HTTP status ${response.status}`);
  }

  const html = await response.text();
  const results: WebSearchResultItem[] = [];

  // Each individual organic result is split on result container
  const resultBlocks = html.split(/<div\s+class="[^"]*result\s+results_links/);

  for (const block of resultBlocks.slice(1)) {
    if (results.length >= limit) break;

    // Filter out sponsored ads
    if (block.includes('badge--ad')) continue;

    const titleMatch = block.match(
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const snippetMatch = block.match(
      /<(?:a|div|span)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i,
    );

    if (titleMatch && titleMatch[1]) {
      const cleanUrl = extractCleanUrl(titleMatch[1]);
      const title = cleanText(titleMatch[2] || 'Untitled');
      const snippet = cleanText(snippetMatch && snippetMatch[1] ? snippetMatch[1] : '');

      if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
        results.push({
          title,
          url: cleanUrl,
          snippet,
        });
      }
    }
  }

  return results;
}

export const webSearchTool: ToolDefinition<typeof webSearchInputSchema, WebSearchOutput> = {
  name: 'web_search',
  displayName: 'Web Search',
  description:
    'Searches the web directly for up-to-date information, documentation, package releases, and technical answers. Returns structured search results with titles, clean URLs, and snippets.',
  parameters: webSearchInputSchema,
  confirmationPolicy: 'never',

  summarize: (args) => {
    return `web_search("${args.query}"${args.site ? ` site:${args.site}` : ''})`;
  },

  execute: async (args, context) => {
    const limit = Math.min(Math.max(1, args.limit ?? 5), 20);
    const fullQuery = args.site ? `${args.query} site:${args.site}` : args.query;

    const timeoutSignal = AbortSignal.timeout(12000);
    const signal = context.abortSignal
      ? AbortSignal.any([context.abortSignal, timeoutSignal])
      : timeoutSignal;

    const results = await searchDuckDuckGoDirect(fullQuery, limit, signal);

    return {
      query: fullQuery,
      resultCount: results.length,
      results,
      source: 'duckduckgo',
    };
  },
};
