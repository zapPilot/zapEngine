import { describe, expect, it, vi } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import type { AcquiredRemoteImage } from './assets.js';
import {
  planVisualAssets,
  VisualSceneExhaustedError,
} from './visual-asset-planner.js';

function article(id: string): ImageCandidate {
  return {
    imageUrl: `https://images.example.test/${id}.jpg`,
    sourceUrl: `https://publisher.example.test/${id}`,
    origin: 'article',
    width: 1_920,
    height: 1_080,
    altText: `${id} editorial photo`,
  };
}

function acquired(id: string): AcquiredRemoteImage {
  return {
    path: `${process.cwd()}/${id}.jpg`,
    contentType: 'image/jpeg',
    sha256: id.padEnd(64, 'a').slice(0, 64),
    width: 1_920,
    height: 1_080,
  };
}

function generatedSlide(assetId: string, rejectionSummary: string | null) {
  return {
    assetId,
    path: `${process.cwd()}/${assetId}.png`,
    contentType: 'image/png' as const,
    sha256: 'b'.repeat(64),
    perceptualHash: 'f'.repeat(16),
    width: 1_920,
    height: 1_080,
    originalImageUrl: 'https://www.zap-pilot.org',
    sourcePageUrl: 'https://www.zap-pilot.org',
    provider: 'generated-slide' as const,
    license: 'brand-generated' as const,
    slide: {
      templateVersion: 'concept-card-v1' as const,
      kicker: 'WHY IT MATTERS',
      headline: 'Fallback concept',
      points: ['Point one'],
      copySource: 'deterministic' as const,
      model: null,
      reason: 'candidate-exhaustion' as const,
      rejectionSummary,
      lead: true,
      costUsd: null,
    },
  };
}

describe('visual asset planner coverage edges', () => {
  it('fails closed when the mandatory lead cover has no publisher image', async () => {
    await expect(
      planVisualAssets({
        scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market photo'] }],
        workingDirectory: process.cwd(),
        requireLeadCover: true,
        dependencies: {
          acquireImage: vi.fn(),
          fingerprintImage: vi.fn(),
          searchProviders: [],
        },
      }),
    ).rejects.toThrow('Publisher og:image is required');
  });

  it('continues to the next editorial candidate after fingerprinting fails', async () => {
    const progress: unknown[] = [];
    const result = await planVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market photo'] }],
      articleImages: [article('broken'), article('usable')],
      workingDirectory: process.cwd(),
      selectionMode: 'resilient',
      onProgress: (event) => progress.push(event),
      dependencies: {
        acquireImage: vi.fn(async (url: string) =>
          acquired(url.includes('broken') ? 'broken' : 'usable'),
        ),
        fingerprintImage: vi
          .fn()
          .mockRejectedValueOnce(new Error('hash decode failed'))
          .mockResolvedValueOnce('ffffffffffffffff'),
        searchProviders: [],
      },
    });

    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]?.originalImageUrl).toContain('usable');
    expect(progress).toContainEqual(
      expect.objectContaining({
        rejectedCandidateCount: 1,
        rejectionSummary: expect.stringContaining('decode'),
      }),
    );
  });

  it('rejects a repeated editorial URL and then reuses the prior image', async () => {
    const repeated = article('same');
    const result = await planVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['first'] }],
      articleImages: [repeated],
      workingDirectory: process.cwd(),
      selectionMode: 'resilient',
      resumePlan: {
        scenes: [],
        assets: [
          {
            assetId: 'image-01',
            path: `${process.cwd()}/resumed.jpg`,
            contentType: 'image/jpeg',
            sha256: 'a'.repeat(64),
            perceptualHash: '0'.repeat(16),
            width: 1_920,
            height: 1_080,
            originalImageUrl: repeated.imageUrl,
            sourcePageUrl: repeated.sourceUrl,
            provider: 'article',
            license: 'unknown',
          },
        ],
      },
      dependencies: {
        acquireImage: vi.fn(),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
        searchProviders: [],
      },
    });

    expect(result.assets).toHaveLength(1);
    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
    ]);
    expect(result.imageSearch?.scenes[0]?.rejections).toContainEqual({
      cause: 'duplicate-url',
      count: 1,
    });
  });

  it('reports never-searched exhaustion when no provider or reusable image exists', async () => {
    await expect(
      planVisualAssets({
        scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market photo'] }],
        workingDirectory: process.cwd(),
        selectionMode: 'strict',
        dependencies: {
          acquireImage: vi.fn(),
          fingerprintImage: vi.fn(),
          searchProviders: [],
        },
      }),
    ).rejects.toMatchObject({
      name: 'VisualSceneExhaustedError',
      reason: 'never-searched',
    } satisfies Partial<VisualSceneExhaustedError>);
  });

  it('reports resilient provider outages as search-failure exhaustion', async () => {
    const search = vi.fn().mockRejectedValue(new Error('provider unavailable'));
    await expect(
      planVisualAssets({
        scenes: [
          {
            sceneId: 'scene-01',
            imageSearchIntent: ['NVIDIA headquarters'],
            imageSearchEntities: ['NVIDIA'],
          },
        ],
        workingDirectory: process.cwd(),
        selectionMode: 'resilient',
        dependencies: {
          acquireImage: vi.fn(),
          fingerprintImage: vi.fn(),
          searchProviders: [{ origin: 'brave', search }],
        },
      }),
    ).rejects.toMatchObject({
      name: 'VisualSceneExhaustedError',
      reason: 'search-failure',
      providerFailures: ['provider unavailable'],
    } satisfies Partial<VisualSceneExhaustedError>);
  });

  it('propagates an abort that arrives during image fingerprinting', async () => {
    const controller = new AbortController();
    const abortError = new Error('lease lost during fingerprint');

    await expect(
      planVisualAssets({
        scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market photo'] }],
        articleImages: [article('abort')],
        workingDirectory: process.cwd(),
        selectionMode: 'resilient',
        signal: controller.signal,
        dependencies: {
          acquireImage: vi.fn().mockResolvedValue(acquired('abort')),
          fingerprintImage: vi.fn().mockImplementation(async () => {
            controller.abort(abortError);
            throw abortError;
          }),
          searchProviders: [],
        },
      }),
    ).rejects.toThrow('lease lost during fingerprint');
  });

  it('passes the accumulated rejection record into generated-slide fallback', async () => {
    const generateSlide = vi.fn(
      async (input: { rejectionSummary: string | null }) =>
        generatedSlide('image-01', input.rejectionSummary),
    );
    const result = await planVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market photo'] }],
      articleImages: [article('broken-only')],
      workingDirectory: process.cwd(),
      selectionMode: 'resilient',
      slideFallback: { title: 'Fallback' },
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('broken-only')),
        fingerprintImage: vi.fn().mockRejectedValue(new Error('decode failed')),
        generateSlide,
        searchProviders: [],
      },
    });

    expect(generateSlide).toHaveBeenCalledWith(
      expect.objectContaining({ rejectionSummary: 'decode:1' }),
    );
    expect(result.assets[0]?.provider).toBe('generated-slide');
  });

  it('resolves default dependencies when every scene is already resumed', async () => {
    const previousKey = process.env['BRAVE_SEARCH_API_KEY'];
    process.env['BRAVE_SEARCH_API_KEY'] = 'test-key-for-coverage';
    try {
      const resumed = article('resumed');
      const result = await planVisualAssets({
        scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market photo'] }],
        workingDirectory: process.cwd(),
        resumePlan: {
          scenes: [{ sceneId: 'scene-01', assetId: 'image-01' }],
          assets: [
            {
              assetId: 'image-01',
              path: `${process.cwd()}/resumed.jpg`,
              contentType: 'image/jpeg',
              sha256: 'a'.repeat(64),
              perceptualHash: '0'.repeat(16),
              width: 1920,
              height: 1080,
              originalImageUrl: resumed.imageUrl,
              sourcePageUrl: resumed.sourceUrl,
              provider: 'article',
              license: 'unknown',
            },
          ],
        },
      });

      expect(result.scenes).toEqual([
        { sceneId: 'scene-01', assetId: 'image-01' },
      ]);
      expect(result.assets).toHaveLength(1);
    } finally {
      if (previousKey === undefined) {
        delete process.env['BRAVE_SEARCH_API_KEY'];
      } else {
        process.env['BRAVE_SEARCH_API_KEY'] = previousKey;
      }
    }
  });

  it('converts a strict-mode provider failure into search-failure exhaustion', async () => {
    const search = vi.fn().mockRejectedValue(new Error('brave down'));
    await expect(
      planVisualAssets({
        scenes: [
          {
            sceneId: 'scene-01',
            imageSearchIntent: ['NVIDIA headquarters'],
            imageSearchEntities: ['NVIDIA'],
          },
        ],
        workingDirectory: process.cwd(),
        selectionMode: 'strict',
        dependencies: {
          acquireImage: vi.fn(),
          fingerprintImage: vi.fn(),
          searchProviders: [{ origin: 'brave', search }],
        },
      }),
    ).rejects.toMatchObject({
      name: 'VisualSceneExhaustedError',
      reason: 'search-failure',
      providerFailures: ['brave down'],
    } satisfies Partial<VisualSceneExhaustedError>);
  });

  it('rethrows a search abort in resilient mode instead of recording exhaustion', async () => {
    const controller = new AbortController();
    const search = vi.fn(async () => {
      controller.abort();
      throw new Error('search aborted');
    });
    await expect(
      planVisualAssets({
        scenes: [
          {
            sceneId: 'scene-01',
            imageSearchIntent: ['NVIDIA headquarters'],
            imageSearchEntities: ['NVIDIA'],
          },
        ],
        workingDirectory: process.cwd(),
        selectionMode: 'resilient',
        signal: controller.signal,
        dependencies: {
          acquireImage: vi.fn(),
          fingerprintImage: vi.fn(),
          searchProviders: [{ origin: 'brave', search }],
        },
      }),
    ).rejects.toThrow('search aborted');
  });

  it('rethrows a search abort in strict mode instead of reporting exhaustion', async () => {
    const controller = new AbortController();
    const search = vi.fn(async () => {
      controller.abort();
      throw new Error('strict search aborted');
    });
    await expect(
      planVisualAssets({
        scenes: [
          {
            sceneId: 'scene-01',
            imageSearchIntent: ['NVIDIA headquarters'],
            imageSearchEntities: ['NVIDIA'],
          },
        ],
        workingDirectory: process.cwd(),
        selectionMode: 'strict',
        signal: controller.signal,
        dependencies: {
          acquireImage: vi.fn(),
          fingerprintImage: vi.fn(),
          searchProviders: [{ origin: 'brave', search }],
        },
      }),
    ).rejects.toThrow('strict search aborted');
  });

  it('preserves a resumed generated-slide asset without subject bookkeeping', async () => {
    const result = await planVisualAssets({
      scenes: [
        { sceneId: 'scene-01', imageSearchIntent: ['market photo'] },
        { sceneId: 'scene-02', imageSearchIntent: ['harbor photo'] },
      ],
      articleImages: [article('fresh')],
      workingDirectory: process.cwd(),
      resumePlan: {
        scenes: [{ sceneId: 'scene-01', assetId: 'image-01' }],
        assets: [generatedSlide('image-01', null)],
      },
      dependencies: {
        acquireImage: vi.fn(async () => acquired('fresh')),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
        searchProviders: [],
      },
    });

    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-02' },
    ]);
    expect(result.assets).toHaveLength(2);
    expect(result.assets[0]?.provider).toBe('generated-slide');
    expect(result.assets[1]?.provider).toBe('article');
  });

  it('omits sourceHostname from progress when the source URL is not parseable', async () => {
    const progress: unknown[] = [];
    const result = await planVisualAssets({
      scenes: [
        { sceneId: 'scene-01', imageSearchIntent: ['market photo'] },
        { sceneId: 'scene-02', imageSearchIntent: ['market photo'] },
      ],
      workingDirectory: process.cwd(),
      onProgress: (event) => progress.push(event),
      resumePlan: {
        scenes: [{ sceneId: 'scene-01', assetId: 'image-01' }],
        assets: [
          {
            assetId: 'image-01',
            path: `${process.cwd()}/legacy.jpg`,
            contentType: 'image/jpeg',
            sha256: 'd'.repeat(64),
            perceptualHash: '0'.repeat(16),
            width: 1920,
            height: 1080,
            originalImageUrl: 'https://images.example.test/legacy.jpg',
            sourcePageUrl: 'not a url',
            provider: 'article',
            license: 'unknown',
          },
        ],
      },
      dependencies: {
        acquireImage: vi.fn(),
        fingerprintImage: vi.fn(),
        searchProviders: [],
      },
    });

    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-01' },
    ]);
    const reusedEvent = progress.find(
      (event) =>
        typeof event === 'object' &&
        event !== null &&
        (event as { sceneId?: string }).sceneId === 'scene-02',
    );
    expect(reusedEvent).toMatchObject({ provider: 'reuse' });
    expect(reusedEvent).not.toHaveProperty('sourceHostname');
  });

  it('assigns image-01 when resumed assets use non-sequential ids', async () => {
    const resumed = article('custom');
    const result = await planVisualAssets({
      scenes: [
        { sceneId: 'scene-01', imageSearchIntent: ['market photo'] },
        { sceneId: 'scene-02', imageSearchIntent: ['harbor photo'] },
      ],
      articleImages: [article('fresh')],
      workingDirectory: process.cwd(),
      resumePlan: {
        scenes: [{ sceneId: 'scene-01', assetId: 'custom-asset' }],
        assets: [
          {
            assetId: 'custom-asset',
            path: `${process.cwd()}/custom.jpg`,
            contentType: 'image/jpeg',
            sha256: 'c'.repeat(64),
            perceptualHash: '0'.repeat(16),
            width: 1920,
            height: 1080,
            originalImageUrl: resumed.imageUrl,
            sourcePageUrl: resumed.sourceUrl,
            provider: 'article',
            license: 'unknown',
          },
        ],
      },
      dependencies: {
        acquireImage: vi.fn(async () => acquired('fresh')),
        fingerprintImage: vi.fn().mockResolvedValue('ffffffffffffffff'),
        searchProviders: [],
      },
    });

    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'custom-asset' },
      { sceneId: 'scene-02', assetId: 'image-01' },
    ]);
  });

  it('rotates over orphaned resume assets with no recorded use counts', async () => {
    const progress: unknown[] = [];
    const result = await planVisualAssets({
      scenes: [
        { sceneId: 'scene-01', imageSearchIntent: ['market photo'] },
        { sceneId: 'scene-02', imageSearchIntent: ['market photo'] },
      ],
      workingDirectory: process.cwd(),
      onProgress: (event) => progress.push(event),
      resumePlan: {
        scenes: [],
        assets: [
          {
            assetId: 'image-01',
            path: `${process.cwd()}/orphan-a.jpg`,
            contentType: 'image/jpeg',
            sha256: 'a'.repeat(64),
            perceptualHash: '0'.repeat(16),
            width: 1920,
            height: 1080,
            originalImageUrl: 'https://images.example.test/orphan-a.jpg',
            sourcePageUrl: 'https://publisher.example.test/orphan-a',
            provider: 'article',
            license: 'unknown',
          },
          {
            assetId: 'image-02',
            path: `${process.cwd()}/orphan-b.jpg`,
            contentType: 'image/jpeg',
            sha256: 'b'.repeat(64),
            perceptualHash: 'f'.repeat(16),
            width: 1920,
            height: 1080,
            originalImageUrl: 'https://images.example.test/orphan-b.jpg',
            sourcePageUrl: 'https://publisher.example.test/orphan-b',
            provider: 'article',
            license: 'unknown',
          },
        ],
      },
      dependencies: {
        acquireImage: vi.fn(),
        fingerprintImage: vi.fn(),
        searchProviders: [],
      },
    });

    expect(result.assets).toHaveLength(2);
    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-02' },
    ]);
    expect(progress).toContainEqual(
      expect.objectContaining({
        phase: 'assets',
        sceneId: 'scene-02',
        provider: 'reuse',
        reuseKind: 'non-consecutive',
      }),
    );
  });

  it('forwards the abort signal to generated-slide fallback', async () => {
    const controller = new AbortController();
    const generateSlide = vi.fn(
      async (input: {
        rejectionSummary: string | null;
        signal?: AbortSignal;
      }) => generatedSlide('image-01', input.rejectionSummary),
    );
    const result = await planVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market photo'] }],
      workingDirectory: process.cwd(),
      selectionMode: 'resilient',
      signal: controller.signal,
      slideFallback: { title: 'Fallback' },
      dependencies: {
        acquireImage: vi.fn(),
        fingerprintImage: vi.fn(),
        generateSlide,
        searchProviders: [],
      },
    });

    expect(generateSlide).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(result.assets[0]?.provider).toBe('generated-slide');
  });

  it('swallows cleanup failures after fingerprinting fails', async () => {
    const result = await planVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market photo'] }],
      articleImages: [article('broken'), article('usable')],
      workingDirectory: process.cwd(),
      dependencies: {
        acquireImage: vi.fn(async (url: string) =>
          url.includes('broken')
            ? {
                path: '\0broken',
                contentType: 'image/jpeg' as const,
                sha256: 'c'.repeat(64),
                width: 1920,
                height: 1080,
              }
            : acquired('usable'),
        ),
        fingerprintImage: vi
          .fn()
          .mockRejectedValueOnce(new Error('hash decode failed'))
          .mockResolvedValueOnce('ffffffffffffffff'),
        searchProviders: [],
      },
    });

    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]?.originalImageUrl).toContain('usable');
    expect(result.imageSearch?.scenes[0]?.rejections).toContainEqual({
      cause: 'decode',
      count: 1,
    });
  });
});
