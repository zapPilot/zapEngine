import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';

import type { Article } from '../types.js';

type JSDOMConsoleError = Error & {
  detail?: unknown;
  type?: string;
};

function createScrapeVirtualConsole(): VirtualConsole {
  const virtualConsole = new VirtualConsole();

  virtualConsole.on('jsdomError', (rawError) => {
    const error = rawError as JSDOMConsoleError;

    if (error.type === 'css parsing') {
      return;
    }

    console.error(error.stack ?? error.message, error.detail);
  });

  return virtualConsole;
}

export async function scrapeArticle(url: string): Promise<Article> {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent':
        'Mozilla/5.0 (compatible; AI Podcast POC/0.1; +https://localhost)',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch article: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  const dom = new JSDOM(html, {
    url,
    virtualConsole: createScrapeVirtualConsole(),
  });

  try {
    const article = new Readability(dom.window.document).parse();
    const title =
      article?.title?.trim() || dom.window.document.title?.trim() || 'Untitled';
    const text = article?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    if (!text) {
      throw new Error('No readable article text found');
    }

    return { title, text };
  } finally {
    dom.window.close();
  }
}
