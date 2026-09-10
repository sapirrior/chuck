import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

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
      // Fallback to regex extraction if URL parsing fails
      const match = url.match(/uddg=([^&]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  }
  return url;
}

/**
 * Searches DuckDuckGo HTML endpoint using regex parsing.
 */
async function searchDuckDuckGoHtml(
  query: string,
  limit: number,
  signal: AbortSignal,
): Promise<WebSearchResultItem[]> {
  const response = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    body: `q=${encodeURIComponent(query)}`,
    signal,
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo returned HTTP status ${response.status}`);
  }

  const html = await response.text();
  const results: WebSearchResultItem[] = [];

  // Match result bodies: <div class="result__body"> ... </div>
  const bodyRegex = /<div\s+class="result__body">([\s\S]*?)<\/div>\s*<\/div>/gi;
  let bodyMatch: RegExpExecArray | null;

  while ((bodyMatch = bodyRegex.exec(html)) !== null && results.length < limit) {
    const chunk = bodyMatch[1];
    if (!chunk) continue;

    // Title and URL extraction
    const titleMatch =
      /<a\s+class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk) ||
      /<a\s+[^>]*class="[^"]*result__snippet[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(
        chunk,
      ) ||
      /<a\s+[^>]*href="([^"]+)"[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk) ||
      /<h2\s+class="result__title">\s*<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);

    const snippetMatch =
      /<a\s+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk) ||
      /<div\s+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i.exec(chunk);

    if (titleMatch && titleMatch[1]) {
      const rawUrl = titleMatch[1];
      const title = cleanText(titleMatch[2] || 'Untitled');
      const snippet = snippetMatch && snippetMatch[1] ? cleanText(snippetMatch[1]) : '';
      const cleanUrl = extractCleanUrl(rawUrl);

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

/**
 * Fallback search using DuckDuckGo Lite endpoint.
 */
async function searchDuckDuckGoLite(
  query: string,
  limit: number,
  signal: AbortSignal,
): Promise<WebSearchResultItem[]> {
  const response = await fetch('https://lite.duckduckgo.com/lite/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    body: `q=${encodeURIComponent(query)}`,
    signal,
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo Lite returned HTTP status ${response.status}`);
  }

  const html = await response.text();
  const results: WebSearchResultItem[] = [];

  // In DDG Lite:
  // Results are in table rows with class="result-link" and class="result-snippet"
  const linkRegex = /<a\s+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<td\s+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  const links: { url: string; title: string }[] = [];
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    links.push({
      url: extractCleanUrl(linkMatch[1] ?? ''),
      title: cleanText(linkMatch[2] ?? ''),
    });
  }

  const snippets: string[] = [];
  let snipMatch: RegExpExecArray | null;
  while ((snipMatch = snippetRegex.exec(html)) !== null) {
    snippets.push(cleanText(snipMatch[1] ?? ''));
  }

  for (let i = 0; i < Math.min(links.length, limit); i++) {
    const item = links[i];
    if (item && (item.url.startsWith('http://') || item.url.startsWith('https://'))) {
      results.push({
        title: item.title,
        url: item.url,
        snippet: snippets[i] || '',
      });
    }
  }

  return results;
}

export const webSearchTool: ToolDefinition<typeof webSearchInputSchema, WebSearchOutput> = {
  name: 'web_search',
  displayName: 'Web Search',
  description:
    'Searches the web for up-to-date information, documentation, package releases, and technical answers. Returns structured search results with titles, clean URLs, and snippets.',
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

    let results: WebSearchResultItem[] = [];
    let source = 'duckduckgo-html';

    try {
      results = await searchDuckDuckGoHtml(fullQuery, limit, signal);
    } catch (primaryError) {
      // Fallback to Lite version if primary endpoint fails or gets blocked
      try {
        results = await searchDuckDuckGoLite(fullQuery, limit, signal);
        source = 'duckduckgo-lite';
      } catch (fallbackError) {
        throw new Error(
          `Web search failed: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}; fallback error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        );
      }
    }

    return {
      query: fullQuery,
      resultCount: results.length,
      results,
      source,
    };
  },
};
