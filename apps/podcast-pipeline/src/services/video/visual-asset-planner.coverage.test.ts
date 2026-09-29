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
});
