import { describe, expect, it, vi } from 'vitest';

import { isPanewsArticleUrl, prepareVideoCover } from './video-cover.js';

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

describe('prepareVideoCover', () => {
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
      path: '/work/video-cover-source.image',
      contentType: 'image/jpeg',
      sha256: 'a'.repeat(64),
      width: 1_200,
      height: 630,
    });
    const pngHash = 'b'.repeat(64);
    const renderPng = vi.fn().mockResolvedValue(pngHash);

    const result = await prepareVideoCover(
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
        filename: 'video-cover-source',
        layout: 'framed',
      }),
    );
    expect(renderPng).toHaveBeenCalledWith(
      '/work/video-cover-source.image',
      '/work/video-cover.png',
    );
    expect(result).toEqual({
      thumbnailPath: '/work/video-cover.png',
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

    const result = await prepareVideoCover(
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
    const result = await prepareVideoCover(
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
    const result = await prepareVideoCover(
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
  it('renders the cover from the visual plan without scraping the article', async () => {
    const scrape = vi.fn();
    const acquire = vi.fn().mockResolvedValue({
      path: '/work/video-cover-source.image',
      contentType: 'image/jpeg',
      sha256: 'c'.repeat(64),
      width: 1_200,
      height: 630,
    });
    const renderPng = vi.fn().mockResolvedValue('d'.repeat(64));

    const result = await prepareVideoCover(
      {
        sourceUrl,
        workingDirectory: '/work',
        knownImageUrl: 'https://images.example.test/lead-scene.jpg',
      },
      { scrape, acquire, renderPng },
    );

    expect(scrape).not.toHaveBeenCalled();
    expect(acquire).toHaveBeenCalledWith(
      'https://images.example.test/lead-scene.jpg',
      expect.objectContaining({ filename: 'video-cover-source' }),
    );
    expect(result.metadata).toMatchObject({
      strategy: 'visual-plan-og-image-v1',
      status: 'selected',
      sourceImageUrl: 'https://images.example.test/lead-scene.jpg',
      sha256: 'd'.repeat(64),
    });
  });

  it('uses a planned cover even when the source is not PANews', async () => {
    const acquire = vi.fn().mockResolvedValue({
      path: '/work/video-cover-source.image',
      contentType: 'image/jpeg',
      sha256: 'c'.repeat(64),
      width: 1_200,
      height: 630,
    });

    const result = await prepareVideoCover(
      {
        sourceUrl: 'https://theblock.example/article',
        workingDirectory: '/work',
        knownImageUrl: 'https://images.example.test/lead-scene.jpg',
      },
      {
        scrape: vi.fn(),
        acquire,
        renderPng: vi.fn().mockResolvedValue('e'.repeat(64)),
      },
    );

    expect(result.thumbnailPath).toBe('/work/video-cover.png');
    expect(result.metadata.status).toBe('selected');
  });

  it('fails open when a planned cover cannot be acquired', async () => {
    const result = await prepareVideoCover(
      {
        sourceUrl,
        workingDirectory: '/work',
        knownImageUrl: 'https://images.example.test/lead-scene.jpg',
      },
      {
        scrape: vi.fn(),
        acquire: vi.fn().mockRejectedValue(new Error('HTTP 410')),
        renderPng: vi.fn(),
      },
    );

    expect(result).toEqual({
      thumbnailPath: null,
      metadata: expect.objectContaining({
        strategy: 'visual-plan-og-image-v1',
        status: 'fallback',
        sourceImageUrl: 'https://images.example.test/lead-scene.jpg',
        fallbackReason: 'HTTP 410',
      }),
    });
  });

  it('scrapes for itself when the plan recorded no lead cover', async () => {
    const scrape = vi.fn().mockResolvedValue({
      title: 'Article',
      text: 'Body',
      images: [
        {
          imageUrl: 'https://images.example.test/cover.jpg',
          sourceUrl,
          origin: 'openGraph',
        },
      ],
    });

    const result = await prepareVideoCover(
      { sourceUrl, workingDirectory: '/work', knownImageUrl: null },
      {
        scrape,
        acquire: vi.fn().mockResolvedValue({
          path: '/work/video-cover-source.image',
          contentType: 'image/jpeg',
          sha256: 'c'.repeat(64),
          width: 1_200,
          height: 630,
        }),
        renderPng: vi.fn().mockResolvedValue('f'.repeat(64)),
      },
    );

    expect(scrape).toHaveBeenCalledTimes(1);
    expect(result.metadata.strategy).toBe('panews-og-image-v1');
  });
});
