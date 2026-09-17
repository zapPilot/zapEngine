import { describe, expect, it, vi } from 'vitest';

import { prepareVideoCover } from './video-cover.js';

describe('prepareVideoCover', () => {
  const sourceUrl =
    'https://www.panewslab.com/zh/articles/01a00000-0000-7000-8000-000000000000';

  it('renders the exact publisher Open Graph image selected by the visual plan', async () => {
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
        knownImageUrl: 'https://images.example.test/lead-scene.jpg',
        signal: new AbortController().signal,
      },
      { acquire, renderPng },
    );

    expect(acquire).toHaveBeenCalledWith(
      'https://images.example.test/lead-scene.jpg',
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
        strategy: 'visual-plan-og-image-v1',
        status: 'selected',
        sourcePageUrl: sourceUrl,
        sourceImageUrl: 'https://images.example.test/lead-scene.jpg',
        storedUrl: null,
        sha256: pngHash,
        width: 1_200,
        height: 630,
        fallbackReason: null,
      },
    });
  });

  it('requires the visual plan to provide the publisher Open Graph image', async () => {
    const acquire = vi.fn();
    const renderPng = vi.fn();

    await expect(
      prepareVideoCover(
        {
          sourceUrl,
          workingDirectory: '/work',
          knownImageUrl: null,
        },
        { acquire, renderPng },
      ),
    ).rejects.toThrow(
      'Video cover requires the publisher og:image selected by the visual plan',
    );
    expect(acquire).not.toHaveBeenCalled();
    expect(renderPng).not.toHaveBeenCalled();
  });

  it('fails the video attempt when the planned Open Graph image cannot be acquired', async () => {
    await expect(
      prepareVideoCover(
        {
          sourceUrl,
          workingDirectory: '/work',
          knownImageUrl: 'https://images.example.test/lead-scene.jpg',
        },
        {
          acquire: vi.fn().mockRejectedValue(new Error('HTTP 410')),
          renderPng: vi.fn(),
        },
      ),
    ).rejects.toThrow('HTTP 410');
  });

  it('fails the video attempt when the planned cover cannot be rendered', async () => {
    await expect(
      prepareVideoCover(
        {
          sourceUrl: 'https://theblock.example/article',
          workingDirectory: '/work',
          knownImageUrl: 'https://images.example.test/lead-scene.jpg',
        },
        {
          acquire: vi.fn().mockResolvedValue({
            path: '/work/video-cover-source.image',
            contentType: 'image/jpeg',
            sha256: 'a'.repeat(64),
            width: 1_200,
            height: 630,
          }),
          renderPng: vi.fn().mockRejectedValue(new Error('libvips failed')),
        },
      ),
    ).rejects.toThrow('libvips failed');
  });
});
