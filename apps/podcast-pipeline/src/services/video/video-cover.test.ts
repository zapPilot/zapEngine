import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { acquireRemoteImage } from './assets.js';
import { prepareVideoCover } from './video-cover.js';
import { planVisualAssets } from './visual-asset-planner.js';

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
        allowSmallDimensions: true,
        referer: sourceUrl,
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

  it.each([
    { width: 640, height: 360 },
    { width: 1200, height: 630 },
  ])(
    'uses the same $width x $height publisher image for the lead and rendered cover',
    async ({ width, height }) => {
      const workingDirectory = await mkdtemp(join(tmpdir(), 'small-og-cover-'));
      try {
        const buffer = await sharp({
          create: { width, height, channels: 3, background: '#abcdef' },
        })
          .jpeg()
          .toBuffer();
        const imageUrl = 'https://images.example.test/publisher.jpg';
        const acquire: typeof acquireRemoteImage = (url, options) =>
          acquireRemoteImage(url, {
            ...options,
            // Deterministic test adapter, not a real host.
            // eslint-disable-next-line sonarjs/no-hardcoded-ip -- deterministic test adapter, not a real host
            resolveHost: async () => ['8.8.8.8'],
            fetchImage: async () =>
              new Response(Uint8Array.from(buffer), {
                headers: { 'content-type': 'image/jpeg' },
              }),
          });
        const plan = await planVisualAssets({
          scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['publisher'] }],
          articleImages: [{ imageUrl, sourceUrl, origin: 'openGraph' }],
          requireLeadCover: true,
          workingDirectory,
          dependencies: { acquireImage: acquire, searchProviders: [] },
        });
        expect(plan.assets[0]).toMatchObject({
          width,
          height,
          originalImageUrl: imageUrl,
        });
        expect(plan.leadCover).toMatchObject({ imageUrl });
        const cover = await prepareVideoCover(
          {
            sourceUrl,
            workingDirectory,
            knownImageUrl: plan.leadCover?.imageUrl,
          },
          { acquire },
        );
        expect(cover.metadata).toMatchObject({
          width,
          height,
          sourceImageUrl: imageUrl,
          status: 'selected',
        });
        expect(await sharp(cover.thumbnailPath!).metadata()).toMatchObject({
          width,
          height,
          format: 'png',
        });
      } finally {
        await rm(workingDirectory, { recursive: true, force: true });
      }
    },
  );

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
