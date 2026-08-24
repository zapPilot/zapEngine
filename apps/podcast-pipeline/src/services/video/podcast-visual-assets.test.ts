import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  PODCAST_INTRO_VISUAL_INTENT,
  ZAP_PILOT_OUTRO_VISUAL_INTENT,
} from '../podcast-packaging.js';
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
    const directory = await mkdtemp(join(tmpdir(), 'podcast-brand-assets-'));
    directories.push(directory);
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
    expect(plan.assets.every((asset) => /^image-\d{2}$/.test(asset.assetId))).toBe(
      true,
    );
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
});
