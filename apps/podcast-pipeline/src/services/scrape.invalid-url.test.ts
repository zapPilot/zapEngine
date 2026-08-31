import { afterEach, describe, expect, it, vi } from 'vitest';

import { scrapeArticle } from './scrape.js';

describe('scrapeArticle invalid URL boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    null,
    undefined,
    '',
    '   ',
    'not a url',
    'ftp://example.com/article',
    'javascript:alert(1)',
  ])('rejects invalid source %p before fetch', async (value) => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      scrapeArticle(value as unknown as string),
    ).rejects.toThrow('Failed to parse URL');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
