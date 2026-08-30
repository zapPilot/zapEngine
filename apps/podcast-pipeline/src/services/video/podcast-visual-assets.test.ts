import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import {
  PODCAST_INTRO_VISUAL_INTENT,
  PODCAST_OUTRO_VISUAL_INTENT,
} from '../podcast-packaging.js';
import type { AcquiredRemoteImage } from './assets.js';
import {
  planPodcastVisualAssets,
  selectCoverAssetForFirstScene,
} from './podcast-visual-assets.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('planPodcastVisualAssets', () => {
  it('copies the bundled intro without emitting search progress', async () => {
    const directory = await temporaryDirectory();
    const progress: { phase: string; sceneId: string }[] = [];

    const plan = await planPodcastVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: [PODCAST_INTRO_VISUAL_INTENT],
        },
      ],
      workingDirectory: join(directory, 'images'),
      selectionMode: 'resilient',
      onProgress: (event) =>
        progress.push({ phase: event.phase, sceneId: event.sceneId }),
    });

    expect(plan.scenes).toEqual([{ sceneId: 'scene-01', assetId: 'image-98' }]);
    expect(plan.assets).toHaveLength(1);
    expect(plan.assets[0]).toMatchObject({
      assetId: 'image-98',
      contentType: 'image/png',
      width: 2880,
      height: 2560,
      originalImageUrl: 'https://www.zap-pilot.org',
      sourcePageUrl: 'https://www.zap-pilot.org',
      provider: 'brand',
      license: 'brand-generated',
    });
    await Promise.all(plan.assets.map((asset) => stat(asset.path)));
    expect(progress).toEqual([{ phase: 'assets', sceneId: 'scene-01' }]);
  });

  it('keeps body scenes on the normal planner and reports progress in scene order', async () => {
    const directory = await temporaryDirectory();
    const acquireImage = vi.fn().mockResolvedValue(acquired('article-body'));
    const fingerprintImage = vi.fn().mockResolvedValue('0000000000000000');
    const progress: { phase: string; sceneId: string; sceneIndex: number }[] =
      [];

    const plan = await planPodcastVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: [PODCAST_INTRO_VISUAL_INTENT],
        },
        {
          sceneId: 'scene-02',
          imageSearchIntent: ['Federal Reserve balance sheet'],
        },
      ],
      articleImages: [candidate('article-body')],
      workingDirectory: join(directory, 'images'),
      selectionMode: 'resilient',
      dependencies: {
        acquireImage,
        searchProviders: [],
        fingerprintImage,
      },
      onProgress: (event) =>
        progress.push({
          phase: event.phase,
          sceneId: event.sceneId,
          sceneIndex: event.sceneIndex,
        }),
    });

    expect(acquireImage).toHaveBeenCalledOnce();
    expect(plan.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-98' },
      { sceneId: 'scene-02', assetId: 'image-01' },
    ]);
    // scene-01 is brand (assets), scene-02 is cover (cover phase)
    expect(progress).toEqual(
      expect.arrayContaining([
        { phase: 'assets', sceneId: 'scene-01', sceneIndex: 1 },
        expect.objectContaining({
          phase: 'cover',
          sceneId: 'scene-02',
          sceneIndex: 2,
        }),
      ]),
    );
    expect(progress.filter((event) => event.phase === 'cover')).toHaveLength(1);
  });
});

describe('selectCoverAssetForFirstScene', () => {
  it('chooses ranked winner when 2 valid candidates (deterministic cover scoring)', async () => {
    const directory = await temporaryDirectory();
    const acquireImage = vi
      .fn()
      .mockResolvedValueOnce(
        acquiredWithDimensions('cover-a', 1600, 900, '0000000000000001'),
      )
      .mockResolvedValueOnce(
        acquiredWithDimensions('cover-b', 2400, 1350, 'ffffffffffffffff'),
      );
    const fingerprintImage = vi
      .fn()
      .mockResolvedValueOnce('0000000000000001')
      .mockResolvedValueOnce('ffffffffffffffff');

    const result = await selectCoverAssetForFirstScene({
      scene: {
        sceneId: 'scene-01',
        imageSearchIntent: ['Federal Reserve balance sheet'],
      },
      articleImages: [
        candidateWithDimensions('cover-a', 1600, 900),
        candidateWithDimensions('cover-b', 2400, 1350),
      ],
      workingDirectory: join(directory, 'cover'),
      dependencies: { acquireImage, searchProviders: [], fingerprintImage },
    });

    expect(result).not.toBeNull();
    expect(result?.candidateCount).toBe(2);
    expect(result?.ranked).toBe(true);
    // Larger dimensions + higher provider priority should win (cover-b is larger)
    expect(result?.asset.originalImageUrl).toContain('cover-b');
    expect(acquireImage).toHaveBeenCalledTimes(2);
  });

  it('succeeds with single valid candidate', async () => {
    const directory = await temporaryDirectory();
    const acquireImage = vi.fn().mockResolvedValue(acquired('single-cover'));
    const fingerprintImage = vi.fn().mockResolvedValue('0000000000000000');

    const result = await selectCoverAssetForFirstScene({
      scene: { sceneId: 'scene-01', imageSearchIntent: ['market'] },
      articleImages: [candidate('single-cover')],
      workingDirectory: join(directory, 'cover'),
      dependencies: { acquireImage, searchProviders: [], fingerprintImage },
    });

    expect(result).not.toBeNull();
    expect(result?.candidateCount).toBe(1);
    expect(result?.ranked).toBe(false);
    expect(result?.asset.originalImageUrl).toContain('single-cover');
  });

  it('returns null when no valid candidate (search failure)', async () => {
    const directory = await temporaryDirectory();
    const acquireImage = vi.fn().mockResolvedValue(null);
    const searchProviders = [
      {
        origin: 'brave' as const,
        search: vi.fn().mockRejectedValue(new Error('Brave unavailable')),
      },
    ];

    const result = await selectCoverAssetForFirstScene({
      scene: { sceneId: 'scene-01', imageSearchIntent: ['market'] },
      articleImages: [],
      workingDirectory: join(directory, 'cover'),
      dependencies: {
        acquireImage,
        searchProviders,
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(result).toBeNull();
  });
});

describe('planPodcastVisualAssets cover fallback', () => {
  it('falls back to resilient planner when cover selector fails and still succeeds', async () => {
    const directory = await temporaryDirectory();
    // Cover selector tries 2 article candidates and both fail, then fallback planner uses same article images and succeeds
    const acquireImage = vi
      .fn()
      .mockRejectedValueOnce(new Error('cover download failed'))
      .mockRejectedValueOnce(new Error('cover download failed 2'))
      .mockResolvedValueOnce(acquired('fallback-body'))
      .mockResolvedValueOnce(acquired('second-body'));
    const fingerprintImage = vi
      .fn()
      .mockResolvedValueOnce('0000000000000000')
      .mockResolvedValueOnce('1111111111111111');
    const progress: {
      phase: string;
      candidateCount?: number;
      assetId?: string;
    }[] = [];

    const plan = await planPodcastVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['Federal Reserve balance sheet'],
        },
        { sceneId: 'scene-02', imageSearchIntent: ['market'] },
      ],
      articleImages: [candidate('fallback-body'), candidate('second-body')],
      workingDirectory: join(directory, 'images'),
      selectionMode: 'resilient',
      dependencies: {
        acquireImage,
        searchProviders: [],
        fingerprintImage,
      },
      onProgress: (event) =>
        progress.push({
          phase: event.phase,
          candidateCount: event.candidateCount,
          assetId: event.assetId,
        }),
    });

    // Even though cover selector failed (candidateCount 0), resilient planner should still produce a plan
    expect(plan.scenes).toHaveLength(2);
    expect(plan.assets.length).toBeGreaterThanOrEqual(1);
    // Cover fallback should have been logged
    const coverProgress = progress.find((e) => e.phase === 'cover');
    expect(coverProgress).toBeDefined();
    expect(coverProgress?.candidateCount).toBe(0);
  });

  it('plans Zap Pilot outro brand asset without search', async () => {
    const directory = await temporaryDirectory();
    const plan = await planPodcastVisualAssets({
      scenes: [
        { sceneId: 'scene-01', imageSearchIntent: ['market'] },
        {
          sceneId: 'scene-02',
          imageSearchIntent: [PODCAST_OUTRO_VISUAL_INTENT],
        },
      ],
      articleImages: [candidate('market')],
      workingDirectory: join(directory, 'images'),
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('market')),
        searchProviders: [],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(plan.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-99' },
    ]);
    expect(plan.assets.find((a) => a.assetId === 'image-99')).toMatchObject({
      provider: 'brand',
      license: 'brand-generated',
    });
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'podcast-brand-assets-'));
  directories.push(directory);
  return directory;
}

function candidate(id: string): ImageCandidate {
  return {
    imageUrl: `https://images.example.test/${id}.jpg`,
    sourceUrl: `https://publisher.example.test/${id}`,
    origin: 'article',
    width: 1600,
    height: 900,
  };
}

function candidateWithDimensions(
  id: string,
  width: number,
  height: number,
): ImageCandidate {
  return {
    imageUrl: `https://images.example.test/${id}.jpg`,
    sourceUrl: `https://publisher.example.test/${id}`,
    origin: 'article',
    width,
    height,
  };
}

function acquired(id: string): AcquiredRemoteImage {
  return {
    path: `/work/${id}.image`,
    contentType: 'image/jpeg',
    sha256: id.padEnd(64, 'a').slice(0, 64),
    width: 1600,
    height: 900,
  };
}

function acquiredWithDimensions(
  id: string,
  width: number,
  height: number,
  hashSuffix = 'a',
): AcquiredRemoteImage {
  return {
    path: `/work/${id}.image`,
    contentType: 'image/jpeg',
    sha256: (id + hashSuffix).padEnd(64, hashSuffix).slice(0, 64),
    width,
    height,
  };
}
