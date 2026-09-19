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
  anchoredPlannerScenes,
  planPodcastVisualAssets,
} from './podcast-visual-assets.js';
import type { VisualAssetPlan } from './visual-asset-planner.js';

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

  it('plans a body scene from the publisher Open Graph image and reports progress in scene order', async () => {
    const directory = await temporaryDirectory();
    const acquireImage = vi.fn().mockResolvedValue(acquired('article-body'));
    const fingerprintImage = vi.fn().mockResolvedValue('0000000000000000');
    const progress: {
      phase: string;
      sceneId: string;
      sceneIndex: number;
      provider?: string;
    }[] = [];

    const cover = candidate('article-body');
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
      articleImages: [cover],
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
    expect(plan.leadCover).toEqual({
      imageUrl: cover.imageUrl,
      fallbackReason: null,
    });
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

  it('fails when the publisher provides no Open Graph image for the lead content scene', async () => {
    const directory = await temporaryDirectory();

    await expect(
      planPodcastVisualAssets({
        scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market'] }],
        articleImages: [candidate('body-photo', 'article')],
        workingDirectory: join(directory, 'images'),
        selectionMode: 'resilient',
        dependencies: {
          acquireImage: vi.fn().mockResolvedValue(acquired('body-photo')),
          searchProviders: [],
          fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
        },
      }),
    ).rejects.toThrow(
      'Publisher og:image is required for the first content scene (missing-open-graph-image)',
    );
  });

  it('fails instead of using another article image when the Open Graph image cannot be acquired', async () => {
    const directory = await temporaryDirectory();
    const acquireImage = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          'Remote asset is not an image or uses an unsupported raster format',
        ),
      )
      .mockResolvedValueOnce(acquired('body-photo'));

    await expect(
      planPodcastVisualAssets({
        scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market'] }],
        articleImages: [
          candidate('og-cover'),
          candidate('body-photo', 'article'),
        ],
        workingDirectory: join(directory, 'images'),
        selectionMode: 'resilient',
        dependencies: {
          acquireImage,
          searchProviders: [],
          fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
        },
      }),
    ).rejects.toThrow(
      'Publisher og:image is required for the first content scene (open-graph-image-acquisition-unsupported-format)',
    );
    expect(acquireImage).toHaveBeenCalledTimes(1);
  });

  it('retries a recovered OG without checkpointing an alternative image', async () => {
    const directory = await temporaryDirectory();
    const checkpoint: VisualAssetPlan = { assets: [], scenes: [] };
    const cover = candidate('publisher-cover');
    const acquireImage = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary HTTP 503'))
      .mockResolvedValue(acquired('publisher-cover'));
    const onSelection = vi.fn(
      async (selection: {
        sceneId: string;
        asset: VisualAssetPlan['assets'][number];
      }) => {
        checkpoint.assets.push(selection.asset);
        checkpoint.scenes.push({
          sceneId: selection.sceneId,
          assetId: selection.asset.assetId,
        });
      },
    );
    const input = {
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market'] }],
      articleImages: [cover, candidate('body-photo', 'article')],
      workingDirectory: join(directory, 'images'),
      selectionMode: 'resilient' as const,
      onSelection,
      dependencies: {
        acquireImage,
        searchProviders: [],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    };
    await expect(planPodcastVisualAssets(input)).rejects.toThrow(
      'open-graph-image-acquisition-http-503',
    );
    expect(onSelection).not.toHaveBeenCalled();
    expect(checkpoint.scenes).toEqual([]);
    const plan = await planPodcastVisualAssets({
      ...input,
      resumePlan: checkpoint,
    });
    expect(acquireImage.mock.calls.map(([url]) => url)).toEqual([
      cover.imageUrl,
      cover.imageUrl,
    ]);
    expect(plan.leadCover?.imageUrl).toBe(cover.imageUrl);
    expect(checkpoint.assets[0]?.originalImageUrl).toBe(cover.imageUrl);
  });

  // The subject-catalog step can come back empty. The publisher cover still
  // owns the lead scene, while later scenes may search the storyboard's own
  // deterministic intents.
  it('searches storyboard intents for later scenes when no subject catalog was resolved', async () => {
    const directory = await temporaryDirectory();
    const search = vi.fn(
      async (query: string): Promise<ImageCandidate[]> => [
        braveCandidate('treasury-desk', query),
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

    const cover = candidate('publisher-cover');
    const plan = await planPodcastVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['Federal Reserve balance sheet'],
        },
        { sceneId: 'scene-02', imageSearchIntent: ['Treasury bond auction'] },
      ],
      articleImages: [cover],
      workingDirectory: join(directory, 'images'),
      selectionMode: 'resilient',
      dependencies: {
        acquireImage,
        fingerprintImage,
        searchProviders: [{ origin: 'brave', search }],
      },
    });

    expect(search.mock.calls.map(([query]) => query)).toEqual([
      'Treasury bond auction',
    ]);
    expect(plan.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-02' },
    ]);
    expect(plan.leadCover?.imageUrl).toBe(cover.imageUrl);
    expect(plan.imageSearch?.requests.map((request) => request.kind)).toEqual([
      'primary',
    ]);
    expect(plan.imageSearch?.scenes.map((scene) => scene.selection)).toEqual([
      'article',
      'pool',
    ]);
  });

  it('carries a scene cue into the planner scene and maps model-context to a context anchor', () => {
    const catalog = {
      primarySubjectId: 'subject-nvidia',
      subjects: [
        {
          id: 'subject-nvidia',
          canonicalName: 'NVIDIA',
          type: 'company' as const,
          aliases: [] as string[],
          storyRole: 'primary' as const,
          evidenceSceneIds: ['scene-01'],
          searchQueries: ['NVIDIA GPU maker'],
          identityHints: ['GPU maker'],
          negativeHints: [] as string[],
          officialDomains: [] as string[],
        },
      ],
    };
    const scenes = anchoredPlannerScenes(
      catalog,
      [
        {
          sceneId: 'scene-01',
          subjectIds: ['subject-nvidia'],
          selectionReason: 'direct',
        },
        {
          sceneId: 'scene-02',
          subjectIds: ['subject-nvidia'],
          selectionReason: 'model-context',
        },
      ],
      [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['news photo'],
          visualCue: 'chip launch keynote',
        },
        {
          sceneId: 'scene-02',
          imageSearchIntent: ['news photo'],
          visualCue: 'trading desk screens',
        },
      ],
    );

    expect(scenes[0]).toMatchObject({
      visualCue: 'chip launch keynote',
      searchAnchor: 'direct',
    });
    expect(scenes[0]?.cueQuery).toContain('NVIDIA');
    expect(scenes[0]?.cueQuery).toContain('chip launch keynote');
    expect(scenes[1]).toMatchObject({
      visualCue: 'trading desk screens',
      searchAnchor: 'context',
    });
    expect(scenes[1]?.cueQuery).toContain('NVIDIA');
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'podcast-brand-assets-'));
  directories.push(directory);
  return directory;
}

function candidate(
  id: string,
  origin: ImageCandidate['origin'] = 'openGraph',
): ImageCandidate {
  return {
    imageUrl: `https://images.example.test/${id}.jpg`,
    sourceUrl: `https://publisher.example.test/${id}`,
    origin,
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
