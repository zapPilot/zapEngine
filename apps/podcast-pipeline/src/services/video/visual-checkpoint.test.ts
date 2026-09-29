import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StoryboardGenerationResult } from './storyboard/orchestrator.js';
import type { PlannedVisualImage } from './visual-asset-planner.js';
import {
  appendVisualCheckpointScene,
  buildVisualCheckpoint,
  downloadVisualCheckpointImage,
  ExpiredVisualCheckpointImageError,
  parseVisualCheckpoint,
  restoreVisualCheckpointPlan,
  restoreVisualStoryboard,
  type VisualCheckpoint,
} from './visual-checkpoint.js';

const identity = { visualVersion: 'v9', sourceHash: 'hash' };

function storyboard(): StoryboardGenerationResult {
  return {
    draft: {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
          imageSearchIntent: ['subject'],
        },
      ],
    },
    effectiveProvider: 'deterministic',
    requestedProvider: 'deterministic',
    model: 'deterministic-v1',
    usedFallback: false,
    attempts: [
      {
        provider: 'deterministic',
        model: 'deterministic-v1',
        outcome: 'success',
      } as never,
    ],
    totalUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
  };
}

function checkpoint(
  subjectCatalogFailure: string | null = null,
): VisualCheckpoint {
  return buildVisualCheckpoint({
    identity,
    storyboard: storyboard(),
    searchIntentModel: null,
    subjectCatalog: null,
    subjectCatalogFailure,
    sceneAssignments: [],
    searchTitleSource: 'publisher',
  });
}

function asset(
  assetId = 'image-01',
  path = join(tmpdir(), 'source.jpg'),
): PlannedVisualImage {
  return {
    assetId,
    path,
    contentType: 'image/jpeg',
    sha256: 'a'.repeat(64),
    perceptualHash: '0'.repeat(16),
    width: 2400,
    height: 1350,
    originalImageUrl: 'https://images.example.test/a.jpg',
    sourcePageUrl: 'https://publisher.example.test/a',
    provider: 'article',
    license: 'unknown',
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('visual checkpoint primitives', () => {
  it('builds and restores storyboard metadata without aliasing attempts', () => {
    const source = storyboard();
    const built = buildVisualCheckpoint({
      identity,
      storyboard: source,
      searchIntentModel: 'model',
      subjectCatalog: null,
      subjectCatalogFailure: 'catalog unavailable',
      sceneAssignments: [],
      searchTitleSource: 'english-localization',
    });

    expect(built.subjectCatalogFailure).toBe('catalog unavailable');
    expect(built.storyboard.attempts).toEqual(source.attempts);
    expect(built.storyboard.attempts).not.toBe(source.attempts);
    expect(restoreVisualStoryboard(built)).toEqual(source);
    expect(checkpoint()).not.toHaveProperty('subjectCatalogFailure');
  });

  it('accepts only matching valid checkpoint identities', () => {
    const value = checkpoint();
    expect(parseVisualCheckpoint(value, identity)).toEqual(value);
    expect(
      parseVisualCheckpoint(value, {
        visualVersion: 'v10',
        sourceHash: 'hash',
      }),
    ).toBeNull();
    expect(
      parseVisualCheckpoint(value, {
        visualVersion: 'v9',
        sourceHash: 'other',
      }),
    ).toBeNull();
    expect(parseVisualCheckpoint({}, identity)).toBeNull();
  });

  it('replaces scene selections and stores each asset only once without local paths', () => {
    const first = appendVisualCheckpointScene(checkpoint(), {
      sceneId: 'scene-01',
      asset: asset(),
      r2Url: 'https://cdn.example.test/image-01.jpg',
    });
    expect(first.assets[0]).not.toHaveProperty('path');

    const replaced = appendVisualCheckpointScene(first, {
      sceneId: 'scene-01',
      asset: asset(),
      r2Url: 'https://cdn.example.test/ignored-duplicate.jpg',
    });
    expect(replaced.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
    ]);
    expect(replaced.assets).toHaveLength(1);

    const second = appendVisualCheckpointScene(replaced, {
      sceneId: 'scene-02',
      asset: asset('image-02', join(tmpdir(), 'second.jpg')),
      r2Url: 'https://cdn.example.test/image-02.jpg',
    });
    expect(second.assets).toHaveLength(2);
    expect(second.scenes).toHaveLength(2);
  });
});

describe('downloadVisualCheckpointImage', () => {
  it('writes successful response bytes to a nested local path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'visual-checkpoint-'));
    const path = join(directory, 'nested', 'image.jpg');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      ),
    );

    try {
      await downloadVisualCheckpointImage(
        'https://cdn.example.test/episodes/image.jpg',
        path,
        new AbortController().signal,
      );
      expect([...(await readFile(path))]).toEqual([1, 2, 3]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('classifies an expired transient checkpoint 404 specially', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 404 })),
    );
    await expect(
      downloadVisualCheckpointImage(
        'https://cdn.example.test/transient/visual-checkpoints/e/v9/h/image.jpg',
        join(tmpdir(), 'unused'),
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(ExpiredVisualCheckpointImageError);
  });

  it('keeps non-checkpoint 404s and other failures generic', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetch);

    await expect(
      downloadVisualCheckpointImage(
        'https://cdn.example.test/episodes/missing.jpg',
        join(tmpdir(), 'unused'),
        new AbortController().signal,
      ),
    ).rejects.toThrow('responded 404');
    await expect(
      downloadVisualCheckpointImage(
        'https://cdn.example.test/episodes/down.jpg',
        join(tmpdir(), 'unused'),
        new AbortController().signal,
      ),
    ).rejects.toThrow('responded 503');
  });
});

describe('restoreVisualCheckpointPlan', () => {
  function storedCheckpoint(): VisualCheckpoint {
    const first = appendVisualCheckpointScene(checkpoint(), {
      sceneId: 'scene-01',
      asset: asset(),
      r2Url: 'https://cdn.example.test/image-01.jpg',
    });
    return {
      ...appendVisualCheckpointScene(first, {
        sceneId: 'scene-02',
        asset: asset('image-02', join(tmpdir(), 'second.jpg')),
        r2Url: 'https://cdn.example.test/image-02.jpg',
      }),
      scenes: [
        { sceneId: 'scene-01', assetId: 'image-01' },
        { sceneId: 'scene-02', assetId: 'image-02' },
        { sceneId: 'scene-03', assetId: 'image-99' },
      ],
    };
  }

  it('skips expired mirrored images and filters scenes to restored assets', async () => {
    const download = vi
      .fn()
      .mockRejectedValueOnce(
        new ExpiredVisualCheckpointImageError(
          'Visual checkpoint image expired',
        ),
      )
      .mockResolvedValueOnce(undefined);
    const result = await restoreVisualCheckpointPlan(storedCheckpoint(), {
      workingDirectory: join(process.cwd(), 'work'),
      signal: new AbortController().signal,
      download,
    });

    expect(result.assets.map(({ assetId }) => assetId)).toEqual(['image-02']);
    expect(result.assets[0]?.path).toBe(
      join(process.cwd(), 'work', 'checkpoint', 'image-02.jpg'),
    );
    expect(result.scenes).toEqual([
      { sceneId: 'scene-02', assetId: 'image-02' },
    ]);
  });

  it('rethrows non-expiry download failures', async () => {
    await expect(
      restoreVisualCheckpointPlan(storedCheckpoint(), {
        workingDirectory: join(process.cwd(), 'work'),
        signal: new AbortController().signal,
        download: vi.fn().mockRejectedValue(new Error('network')),
      }),
    ).rejects.toThrow('network');
  });

  it('preserves an abort raised while handling a failed download', async () => {
    const controller = new AbortController();
    const download = vi.fn(async () => {
      controller.abort(new Error('aborted'));
      throw new Error('network');
    });
    await expect(
      restoreVisualCheckpointPlan(storedCheckpoint(), {
        workingDirectory: join(process.cwd(), 'work'),
        signal: controller.signal,
        download,
      }),
    ).rejects.toThrow('aborted');
  });
});
