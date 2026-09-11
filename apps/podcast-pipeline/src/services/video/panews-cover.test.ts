import { describe, expect, it, vi } from 'vitest';

import { isPanewsArticleUrl, preparePanewsVideoCover } from './panews-cover.js';

describe('isPanewsArticleUrl', () => {
  it.each([
    'https://www.panewslab.com/zh/articles/01a-example',
    'https://panews.io/articles/example',
    'https://t-www.panewslab.com/zh/articles/example',
  ])('accepts PANews article URL %s', (url) => {
    expect(isPanewsArticleUrl(url)).toBe(true);
  });

  it.each([
    'https://example.com/articles/example',
    'https://www.panewslab.com/zh/news',
    'not-a-url',
  ])('rejects non-PANews article URL %s', (url) => {
    expect(isPanewsArticleUrl(url)).toBe(false);
  });
});

describe('preparePanewsVideoCover', () => {
  const sourceUrl =
    'https://www.panewslab.com/zh/articles/01a00000-0000-7000-8000-000000000000';

  it('uses the publisher Open Graph image and converts it to a hashed PNG', async () => {
    const scrape = vi.fn().mockResolvedValue({
      title: 'Article',
      text: 'Body',
      images: [
        {
          imageUrl: 'https://images.example.test/body.jpg',
          sourceUrl,
          origin: 'article',
        },
        {
          imageUrl: 'https://images.example.test/cover.jpg',
          sourceUrl,
          origin: 'openGraph',
          width: 1_200,
          height: 630,
        },
      ],
    });
    const acquire = vi.fn().mockResolvedValue({
      path: '/work/panews-cover-source.image',
      contentType: 'image/jpeg',
      sha256: 'a'.repeat(64),
      width: 1_200,
      height: 630,
    });
    const pngHash = 'b'.repeat(64);
    const renderPng = vi.fn().mockResolvedValue(pngHash);

    const result = await preparePanewsVideoCover(
      {
        sourceUrl,
        workingDirectory: '/work',
        signal: new AbortController().signal,
      },
      { scrape, acquire, renderPng },
    );

    expect(scrape).toHaveBeenCalledWith(sourceUrl, {
      signal: expect.any(AbortSignal),
      timeoutMs: 15_000,
    });
    expect(acquire).toHaveBeenCalledWith(
      'https://images.example.test/cover.jpg',
      expect.objectContaining({
        workingDirectory: '/work',
        filename: 'panews-cover-source',
        layout: 'framed',
      }),
    );
    expect(renderPng).toHaveBeenCalledWith(
      '/work/panews-cover-source.image',
      '/work/panews-cover.png',
    );
    expect(result).toEqual({
      thumbnailPath: '/work/panews-cover.png',
      metadata: {
        strategy: 'panews-og-image-v1',
        status: 'selected',
        sourcePageUrl: sourceUrl,
        sourceImageUrl: 'https://images.example.test/cover.jpg',
        storedUrl: null,
        sha256: pngHash,
        width: 1_200,
        height: 630,
        fallbackReason: null,
      },
    });
  });

  it('falls back without network work for non-PANews sources', async () => {
    const scrape = vi.fn();
    const acquire = vi.fn();
    const renderPng = vi.fn();

    const result = await preparePanewsVideoCover(
      {
        sourceUrl: 'https://example.com/article',
        workingDirectory: '/work',
      },
      { scrape, acquire, renderPng },
    );

    expect(scrape).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
    expect(renderPng).not.toHaveBeenCalled();
    expect(result.thumbnailPath).toBeNull();
    expect(result.metadata).toMatchObject({
      status: 'fallback',
      storedUrl: null,
      fallbackReason: 'source-is-not-panews',
    });
  });

  it('keeps the renderer thumbnail when PANews has no Open Graph image', async () => {
    const acquire = vi.fn();
    const renderPng = vi.fn();
    const result = await preparePanewsVideoCover(
      { sourceUrl, workingDirectory: '/work' },
      {
        scrape: vi.fn().mockResolvedValue({ title: 'Article', text: 'Body' }),
        acquire,
        renderPng,
      },
    );

    expect(acquire).not.toHaveBeenCalled();
    expect(renderPng).not.toHaveBeenCalled();
    expect(result).toEqual({
      thumbnailPath: null,
      metadata: expect.objectContaining({
        strategy: 'panews-og-image-v1',
        status: 'fallback',
        sourceImageUrl: null,
        storedUrl: null,
        fallbackReason: 'missing-open-graph-image',
      }),
    });
  });

  it('fails open when the cover image cannot be acquired', async () => {
    const result = await preparePanewsVideoCover(
      { sourceUrl, workingDirectory: '/work' },
      {
        scrape: vi.fn().mockResolvedValue({
          title: 'Article',
          text: 'Body',
          images: [
            {
              imageUrl: 'https://images.example.test/cover.jpg',
              sourceUrl,
              origin: 'openGraph',
            },
          ],
        }),
        acquire: vi.fn().mockRejectedValue(new Error('HTTP 503')),
        renderPng: vi.fn(),
      },
    );

    expect(result).toEqual({
      thumbnailPath: null,
      metadata: expect.objectContaining({
        status: 'fallback',
        sourceImageUrl: 'https://images.example.test/cover.jpg',
        storedUrl: null,
        fallbackReason: 'HTTP 503',
      }),
    });
  });
});
