import { afterEach, describe, expect, it, vi } from 'vitest';

import { scrapeArticle } from './scrape.js';

describe('scrapeArticle PANews soft-404 boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a PANews soft-404 page that returns HTTP 200', async () => {
    const html = `
      <html>
        <head><title>PANews | PANews</title></head>
        <body>
          <main>
            <h1>去看看别的吧～</h1>
            <h2>热门文章</h2>
            <section>
              <p>This recommendations page contains enough unrelated text for Readability to parse.</p>
              <p>Without a source-specific guard it can be mistaken for the requested article.</p>
            </section>
          </main>
        </body>
      </html>
    `;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(html, { status: 200, statusText: 'OK' }),
        ),
    );

    await expect(
      scrapeArticle(
        'https://www.panewslab.com/zh/articles/01a04d4b-fe26-7636-b074-149a675ab26a',
      ),
    ).rejects.toThrow('PANews article is unavailable');
  });

  it('accepts a PANews article page with the real article container', async () => {
    const html = `
      <html>
        <head><title>Live PANews Article | PANews</title></head>
        <body>
          <article class="article-content">
            <h1>Live PANews Article</h1>
            <p>This is the requested PANews article body.</p>
            <p>It should continue through normal Readability extraction.</p>
          </article>
        </body>
      </html>
    `;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(html, { status: 200, statusText: 'OK' }),
        ),
    );

    const result = await scrapeArticle(
      'https://www.panewslab.com/zh/articles/01a0673b-57b9-7093-9af2-5dc2f9026527',
    );

    expect(result.title).toContain('Live PANews Article');
    expect(result.text).toContain('requested PANews article body');
  });
});
