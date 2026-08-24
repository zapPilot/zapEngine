import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import {
  PODCAST_INTRO_VISUAL_INTENT,
  ZAP_PILOT_OUTRO_VISUAL_INTENT,
} from '../podcast-packaging.js';
import type { AcquiredRemoteImage } from './assets.js';
import { planPodcastVisualAssets } from './podcast-visual-assets.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('planPodcastVisualAssets', () => {
  it('renders intro/outro locally without emitting search progress', async () => {
    const directory = await temporaryDirectory();
    const progress: { phase: string; sceneId: string }[] = [];

    const plan = await planPodcastVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: [PODCAST_INTRO_VISUAL_INTENT],
        },
        {
          sceneId: 'scene-02',
          imageSearchIntent: [ZAP_PILOT_OUTRO_VISUAL_INTENT],
        },
      ],
      workingDirectory: join(directory, 'images'),
      selectionMode: 'resilient',
      onProgress: (event) =>
        progress.push({ phase: event.phase, sceneId: event.sceneId }),
    });

    expect(plan.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-98' },
      { sceneId: 'scene-02', assetId: 'image-99' },
    ]);
    expect(plan.assets.map((asset) => asset.assetId)).toEqual([
      'image-98',
      'image-99',
    ]);
    expect(
      plan.assets.every((asset) => /^image-\d{2}$/.test(asset.assetId)),
    ).toBe(true);
    expect(
      plan.assets.every(
        (asset) =>
          asset.contentType === 'image/png' &&
          new URL(asset.originalImageUrl).protocol === 'https:' &&
          new URL(asset.sourcePageUrl).protocol === 'https:',
      ),
    ).toBe(true);
    await Promise.all(plan.assets.map((asset) => stat(asset.path)));
    expect(progress).toEqual([
      { phase: 'assets', sceneId: 'scene-01' },
      { phase: 'assets', sceneId: 'scene-02' },
    ]);
  });

  it('keeps body scenes on the normal planner and reports progress in scene order', async () => {
    const directory = await temporaryDirectory();
    const acquireImage = vi.fn().mockResolvedValue(acquired('article-body'));
    const fingerprintImage = vi.fn().mockResolvedValue('0000000000000000');
    const progress: { phase: string; sceneId: string; sceneIndex: number }[] = [];

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
        {
          sceneId: 'scene-03',
          imageSearchIntent: [ZAP_PILOT_OUTRO_VISUAL_INTENT],
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
      { sceneId: 'scene-03', assetId: 'image-99' },
    ]);
    expect(progress.filter((event) => event.phase === 'assets')).toEqual([
      { phase: 'assets', sceneId: 'scene-01', sceneIndex: 1 },
      { phase: 'assets', sceneId: 'scene-02', sceneIndex: 2 },
      { phase: 'assets', sceneId: 'scene-03', sceneIndex: 3 },
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

function acquired(id: string): AcquiredRemoteImage {
  return {
    path: `/work/${id}.image`,
    contentType: 'image/jpeg',
    sha256: id.padEnd(64, 'a').slice(0, 64),
    width: 1600,
    height: 900,
  };
}
