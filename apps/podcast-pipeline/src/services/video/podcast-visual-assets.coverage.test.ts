import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PODCAST_INTRO_VISUAL_INTENT } from '../podcast-packaging.js';
import { anchoredPlannerScenes } from './podcast-visual-assets.js';

const directories: string[] = [];

function catalog() {
  return {
    primarySubjectId: 'subject-primary',
    subjects: [
      {
        id: 'subject-primary',
        canonicalName: 'Primary Company',
        type: 'company' as const,
        aliases: [] as string[],
        storyRole: 'primary' as const,
        evidenceSceneIds: ['scene-01'],
        searchQueries: ['Primary Company'],
        identityHints: ['company'],
        negativeHints: [] as string[],
        officialDomains: [] as string[],
      },
    ],
  };
}

async function directory(prefix: string) {
  const value = await mkdtemp(join(tmpdir(), prefix));
  directories.push(value);
  return value;
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock('./storyboard/draft.js');
  vi.doUnmock('./visual-asset-planner.js');
  vi.doUnmock('sharp');
  await Promise.all(
    directories
      .splice(0)
      .map((value) => rm(value, { recursive: true, force: true })),
  );
});

describe('podcast visual asset coverage edges', () => {
  it('rejects a lead assignment that is not anchored to the primary subject', () => {
    expect(() =>
      anchoredPlannerScenes(
        catalog(),
        [
          {
            sceneId: 'scene-01',
            subjectIds: ['subject-other'],
            selectionReason: 'direct',
          },
        ],
        [{ sceneId: 'scene-01', imageSearchIntent: ['news'] }],
      ),
    ).toThrow('Lead visual must be anchored to primary subject');
  });

  it('rejects a missing later assignment after a valid lead assignment', () => {
    expect(() =>
      anchoredPlannerScenes(
        catalog(),
        [
          {
            sceneId: 'scene-01',
            subjectIds: ['subject-primary'],
            selectionReason: 'direct',
          },
        ],
        [
          { sceneId: 'scene-01', imageSearchIntent: ['news'] },
          { sceneId: 'scene-02', imageSearchIntent: ['market'] },
        ],
      ),
    ).toThrow('Visual subject assignment is missing for scene-02');
  });

  it('rejects an assignment whose subject IDs are absent from the catalog', () => {
    const emptyCatalog = { ...catalog(), subjects: [] };
    expect(() =>
      anchoredPlannerScenes(
        emptyCatalog,
        [
          {
            sceneId: 'scene-01',
            subjectIds: ['subject-primary'],
            selectionReason: 'direct',
          },
        ],
        [{ sceneId: 'scene-01', imageSearchIntent: ['news'] }],
      ),
    ).toThrow('Visual subjects are missing for scene-01');
  });

  it('filters unrelated resume scenes and assets before planning current content', async () => {
    const workingDirectory = await directory('podcast-visual-resume-');
    const { planPodcastVisualAssets } =
      await import('./podcast-visual-assets.js');
    const cover = {
      imageUrl: 'https://images.example.test/cover.jpg',
      sourceUrl: 'https://publisher.example.test/story',
      origin: 'openGraph' as const,
      width: 1600,
      height: 1000,
    };

    const result = await planPodcastVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market'] }],
      articleImages: [cover],
      workingDirectory,
      selectionMode: 'resilient',
      resumePlan: {
        scenes: [
          { sceneId: 'scene-01', assetId: 'image-01' },
          { sceneId: 'scene-99', assetId: 'image-77' },
        ],
        assets: [
          {
            assetId: 'image-01',
            path: '/work/image-01',
            contentType: 'image/jpeg',
            sha256: '1'.repeat(64),
            perceptualHash: '1'.repeat(16),
            width: 1000,
            height: 1000,
            originalImageUrl: cover.imageUrl,
            sourcePageUrl: cover.sourceUrl,
            provider: 'article',
            license: 'unknown',
          },
          {
            assetId: 'image-77',
            path: '/unused',
            contentType: 'image/jpeg',
            sha256: '7'.repeat(64),
            perceptualHash: '7'.repeat(16),
            width: 1000,
            height: 1000,
            originalImageUrl: 'https://images.example.test/unused.jpg',
            sourcePageUrl: 'https://publisher.example.test/unused',
            provider: 'article',
            license: 'unknown',
          },
        ],
      },
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue({
          path: join(workingDirectory, 'cover.jpg'),
          contentType: 'image/jpeg',
          sha256: 'a'.repeat(64),
          width: 1600,
          height: 1000,
        }),
        fingerprintImage: vi.fn().mockResolvedValue('0'.repeat(16)),
        searchProviders: [],
      },
    });

    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
    ]);
    expect(result.assets.map((asset) => asset.assetId)).toEqual(['image-01']);
  });

  it('uses the default lead-cover failure reason when the planner omits lead-cover metadata', async () => {
    vi.doMock('./visual-asset-planner.js', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('./visual-asset-planner.js')>();
      return {
        ...actual,
        planVisualAssets: async () => ({ assets: [], scenes: [] }),
      };
    });
    const { planPodcastVisualAssets } =
      await import('./podcast-visual-assets.js');

    await expect(
      planPodcastVisualAssets({
        scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market'] }],
        workingDirectory: await directory('podcast-visual-no-cover-'),
        selectionMode: 'resilient',
      }),
    ).rejects.toThrow('missing-open-graph-image');
  });

  it('throws when the planner returns no asset mapping for a content scene', async () => {
    vi.doMock('./visual-asset-planner.js', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('./visual-asset-planner.js')>();
      return {
        ...actual,
        planVisualAssets: async () => ({
          assets: [],
          scenes: [],
          leadCover: {
            imageUrl: 'https://images.example.test/cover.jpg',
            fallbackReason: null,
          },
        }),
      };
    });
    const { planPodcastVisualAssets } =
      await import('./podcast-visual-assets.js');

    await expect(
      planPodcastVisualAssets({
        scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market'] }],
        workingDirectory: await directory('podcast-visual-no-scene-'),
        selectionMode: 'resilient',
      }),
    ).rejects.toThrow('Content scene scene-01 has no planned asset');
  });

  it('keeps a planner progress index when the planner reports an unknown scene', async () => {
    const progress = vi.fn();
    vi.doMock('./visual-asset-planner.js', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('./visual-asset-planner.js')>();
      return {
        ...actual,
        planVisualAssets: async (input: {
          onProgress?: (event: Record<string, unknown>) => void;
        }) => {
          input.onProgress?.({
            phase: 'assets',
            sceneId: 'scene-99',
            sceneIndex: 7,
            sceneCount: 1,
            provider: 'article',
            assetId: 'image-01',
            elapsedMs: 1,
          });
          return {
            assets: [],
            scenes: [{ sceneId: 'scene-01', assetId: 'image-01' }],
            leadCover: {
              imageUrl: 'https://images.example.test/cover.jpg',
              fallbackReason: null,
            },
          };
        },
      };
    });
    const { planPodcastVisualAssets } =
      await import('./podcast-visual-assets.js');

    await planPodcastVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['market'] }],
      workingDirectory: await directory('podcast-visual-progress-'),
      selectionMode: 'resilient',
      onProgress: progress,
    });

    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneId: 'scene-99',
        sceneIndex: 7,
        sceneCount: 1,
      }),
    );
  });

  it('fails a bundled brand asset whose decoder reports no dimensions', async () => {
    vi.doMock('sharp', () => ({
      default: () => ({ metadata: async () => ({}) }),
    }));
    const { planPodcastVisualAssets } =
      await import('./podcast-visual-assets.js');

    await expect(
      planPodcastVisualAssets({
        scenes: [
          {
            sceneId: 'scene-01',
            imageSearchIntent: [PODCAST_INTRO_VISUAL_INTENT],
          },
        ],
        workingDirectory: await directory('podcast-visual-dimensions-'),
        selectionMode: 'resilient',
      }),
    ).rejects.toThrow('has no dimensions');
  });
});
