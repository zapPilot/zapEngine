import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { scrapeArticle } from './scrape.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return { ...actual };
});

describe('scrapeArticle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('throws when response is not ok', async () => {
    vi.stubEnv('HTTP_PROXY', '');
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response('', { status: 404, statusText: 'Not Found' }),
      );
    vi.stubGlobal('fetch', mockFetch);

    await expect(scrapeArticle('https://example.com')).rejects.toThrow(
      'Failed to fetch article: 404 Not Found',
    );
  });

  it('aborts a stalled visual re-scrape at its requested deadline', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const mockFetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          requestSignal = init?.signal ?? undefined;
          requestSignal?.addEventListener(
            'abort',
            () =>
              reject(
                requestSignal?.reason instanceof Error
                  ? requestSignal.reason
                  : new Error('Request aborted'),
              ),
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = scrapeArticle('https://example.com/visual-source', {
      timeoutMs: 25,
    });
    const assertion = expect(result).rejects.toThrow(
      'Article scrape timed out after 25ms',
    );
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
    expect(requestSignal?.aborted).toBe(true);
  });

  it('returns article from successful fetch', async () => {
    const html = `
      <html>
        <head><title>Test Article</title></head>
        <body>
          <article>
            <p>This is the article content with multiple paragraphs.</p>
            <p>Another paragraph here.</p>
          </article>
        </body>
      </html>
    `;

    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(html, { status: 200, statusText: 'OK' }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await scrapeArticle('https://example.com/article');

    expect(result.title).toBe('Test Article');
    expect(result.text).toBeTruthy();
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('extracts structured article image candidates from a fixed fixture', async () => {
    const html = await readFile(
      new URL('./__fixtures__/article-images.html', import.meta.url),
      'utf8',
    );
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(html, { status: 200, statusText: 'OK' }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await scrapeArticle(
      'https://publisher.example.test/news/power-markets',
    );

    expect(result.images).toEqual([
      {
        imageUrl: 'https://cdn.example.test/social-grid.jpg',
        sourceUrl: 'https://publisher.example.test/news/power-markets',
        origin: 'openGraph',
        altText: 'A regional power grid at dusk',
        width: 2400,
        height: 1260,
      },
      {
        imageUrl: 'https://publisher.example.test/images/control-room.jpg',
        sourceUrl: 'https://publisher.example.test/news/power-markets',
        origin: 'article',
        altText: 'Operators in a control room',
        width: 1600,
        height: 900,
      },
      {
        imageUrl: 'https://publisher.example.test/images/chart-large.jpg',
        sourceUrl: 'https://publisher.example.test/news/power-markets',
        origin: 'article',
        altText: 'Electricity demand chart',
        width: 1920,
        height: 1080,
      },
      {
        imageUrl: 'https://publisher.example.test/images/turbine-high.jpg',
        sourceUrl: 'https://publisher.example.test/news/power-markets',
        origin: 'figure',
        altText: 'Wind turbines near a transmission corridor',
        width: 1200,
        height: 800,
      },
      {
        imageUrl: 'https://media.example.test/standalone-figure.webp',
        sourceUrl: 'https://publisher.example.test/news/power-markets',
        origin: 'figure',
        altText: 'A standalone grid map',
        width: 1280,
        height: 720,
      },
    ]);
  });

  it('does not log noisy jsdom CSS parse errors while scraping', async () => {
    const html = `
      <html>
        <head>
          <title>Article With Modern CSS</title>
          <style>
            @layer theme {
              :root {
                --ui-color-primary-50: oklch(98.2% 0.018 155.826);
              }
            }
          </style>
        </head>
        <body>
          <article>
            <h1>Article With Modern CSS</h1>
            <p>This readable article has enough text for Readability to parse it.</p>
            <p>Modern CSS should not make the scraper emit a misleading error.</p>
          </article>
        </body>
      </html>
    `;

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(html, { status: 200, statusText: 'OK' }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await scrapeArticle('https://example.com/modern-css');

    expect(result.title).toBe('Article With Modern CSS');
    expect(result.text).toContain('Modern CSS should not make the scraper');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('uses document title when article has no title', async () => {
    const html = `
      <html>
        <head><title>Document Title</title></head>
        <body>
          <p>Some content</p>
        </body>
      </html>
    `;

    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(html, { status: 200, statusText: 'OK' }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await scrapeArticle('https://example.com/no-article-title');

    expect(result.title).toBe('Document Title');
  });

  it('throws when no readable text is found', async () => {
    const html = `
      <html>
        <head><title>Empty Page</title></head>
        <body></body>
      </html>
    `;

    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(html, { status: 200, statusText: 'OK' }));
    vi.stubGlobal('fetch', mockFetch);

    await expect(scrapeArticle('https://example.com/empty')).rejects.toThrow(
      'No readable article text found',
    );
  });

  it('sets correct fetch headers', async () => {
    const html = `<html><body><p>Content</p></body></html>`;
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(html, { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await scrapeArticle('https://example.com/test');

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/test', {
      headers: expect.objectContaining({
        'user-agent': expect.stringContaining('AI Podcast POC'),
      }),
    });
  });

  it('handles JSDOM console errors without a message property', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const html = `<html><head><title>Test</title><style>:root {}</style></head><body><p>Content</p></body></html>`;
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(html, { status: 200, statusText: 'OK' }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await scrapeArticle('https://example.com/test');

    expect(result.title).toBe('Test');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('logs to console.error when JSDOM emits non-CSS parsing jsdomError', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const html = `<html><head><title>Test Error Type</title></head><body><p>Content</p></body></html>`;
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(html, { status: 200, statusText: 'OK' }));
    vi.stubGlobal('fetch', mockFetch);

    await scrapeArticle('https://example.com/test-error-type');

    const jsdomErrorCall = consoleErrorSpy.mock.calls.find(
      (call) =>
        call[0] && typeof call[0] === 'string' && call[0].includes('Error'),
    );
    expect(jsdomErrorCall).toBeUndefined();
    consoleErrorSpy.mockRestore();
  });

  it('does not throw when JSDOM jsdomError handler logs error to console', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const html = `<html><head><title>Test Cleanup</title></head><body><p>Content here</p></body></html>`;
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(html, { status: 200, statusText: 'OK' }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await scrapeArticle('https://example.com/test-cleanup');
    expect(result.title).toBe('Test Cleanup');
    consoleErrorSpy.mockRestore();
  });
});
