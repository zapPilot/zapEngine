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
import { planPodcastVisualAssets } from './podcast-visual-assets.js';

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
    expect(plan.imageSearch).toBeUndefined();
  });

  it('plans a body scene from the publisher article and reports progress in scene order', async () => {
    const directory = await temporaryDirectory();
    const acquireImage = vi.fn().mockResolvedValue(acquired('article-body'));
    const fingerprintImage = vi.fn().mockResolvedValue('0000000000000000');
    const progress: {
      phase: string;
      sceneId: string;
      sceneIndex: number;
      provider?: string;
    }[] = [];

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
          ...(event.provider ? { provider: event.provider } : {}),
        }),
    });

    expect(acquireImage).toHaveBeenCalledOnce();
    expect(plan.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-98' },
      { sceneId: 'scene-02', assetId: 'image-01' },
    ]);
    expect(progress).toEqual([
      {
        phase: 'assets',
        sceneId: 'scene-01',
        sceneIndex: 1,
        provider: 'brand',
      },
      {
        phase: 'assets',
        sceneId: 'scene-02',
        sceneIndex: 2,
        provider: 'article',
      },
    ]);
  });

  it('plans the Zap Pilot outro brand asset without search', async () => {
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

  // The subject-catalog step can come back empty, and an episode without
  // disambiguated subjects still has to render.
  it('searches the storyboard intents when no subject catalog was resolved', async () => {
    const directory = await temporaryDirectory();
    const search = vi.fn(
      async (query: string): Promise<ImageCandidate[]> => [
        braveCandidate(
          query.startsWith('Federal') ? 'fed-building' : 'treasury-desk',
          query,
        ),
      ],
    );
    const acquireImage = vi.fn(
      async (url: string): Promise<AcquiredRemoteImage> =>
        acquired(new URL(url).pathname.replace(/^\/|\.jpg$/g, '')),
    );
    const fingerprintImage = vi
      .fn()
      .mockResolvedValueOnce('0000000000000000')
      .mockResolvedValueOnce('ffffffffffffffff');

    const plan = await planPodcastVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['Federal Reserve balance sheet'],
        },
        { sceneId: 'scene-02', imageSearchIntent: ['Treasury bond auction'] },
      ],
      articleImages: [],
      workingDirectory: join(directory, 'images'),
      selectionMode: 'resilient',
      dependencies: {
        acquireImage,
        fingerprintImage,
        searchProviders: [{ origin: 'brave', search }],
      },
    });

    expect(search.mock.calls.map(([query]) => query)).toEqual([
      'Federal Reserve balance sheet',
      'Treasury bond auction',
    ]);
    expect(plan.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-02' },
    ]);
    expect(plan.imageSearch?.requests.map((request) => request.kind)).toEqual([
      'primary',
      'primary',
    ]);
    expect(plan.imageSearch?.scenes.map((scene) => scene.selection)).toEqual([
      'pool',
      'pool',
    ]);
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

function braveCandidate(id: string, altText: string): ImageCandidate {
  return {
    imageUrl: `https://images.example.test/${id}.jpg`,
    sourceUrl: `https://news.example.test/${id}`,
    altText,
    origin: 'brave',
    width: 1600,
    height: 900,
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
