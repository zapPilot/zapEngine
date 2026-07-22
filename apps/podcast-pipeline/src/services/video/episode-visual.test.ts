import { describe, expect, it } from 'vitest';

import {
  buildEpisodeVisualPayload,
  hashEpisodeVisualSelection,
  parseEpisodeVisualPayload,
} from './episode-visual.js';
import type { StoryboardGenerationResult } from './storyboard/orchestrator.js';
import type { PlannedVisualImage } from './visual-asset-planner.js';

const episodeId = '00000000-0000-4000-8000-000000000001';
const localizationId = '00000000-0000-4000-8000-000000000002';

const storyboard: StoryboardGenerationResult = {
  draft: {
    scenes: [
      {
        sceneId: 'scene-01',
        startSentenceId: 's0001',
        endSentenceId: 's0001',
        imageSearchIntent: ['control room'],
      },
      {
        sceneId: 'scene-02',
        startSentenceId: 's0002',
        endSentenceId: 's0002',
        imageSearchIntent: ['power grid'],
      },
      {
        sceneId: 'scene-03',
        startSentenceId: 's0003',
        endSentenceId: 's0003',
        imageSearchIntent: ['research lab'],
      },
    ],
  },
  effectiveProvider: 'deterministic',
  requestedProvider: 'deterministic',
  model: 'deterministic-v1',
  usedFallback: false,
  attempts: [],
  totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
};

const assets: PlannedVisualImage[] = [
  {
    assetId: 'image-01',
    path: '/work/image-01',
    contentType: 'image/jpeg',
    sha256: 'a'.repeat(64),
    perceptualHash: '0'.repeat(16),
    width: 2400,
    height: 1350,
    originalImageUrl: 'https://images.example.test/a.jpg',
    sourcePageUrl: 'https://publisher.example.test/a',
    provider: 'article',
    license: 'unknown',
  },
  {
    assetId: 'image-02',
    path: '/work/image-02',
    contentType: 'image/webp',
    sha256: 'b'.repeat(64),
    perceptualHash: 'f'.repeat(16),
    width: 2400,
    height: 1600,
    originalImageUrl: 'https://images.example.test/b.webp',
    sourcePageUrl: 'https://publisher.example.test/b',
    provider: 'bing',
    license: 'unknown',
  },
];

describe('episode visual payload', () => {
  it('materializes image-only scenes with shared immutable R2 assets', () => {
    const selectedScenes = [
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-02' },
      { sceneId: 'scene-03', assetId: 'image-01' },
    ];
    const visualHash = hashEpisodeVisualSelection({
      visualVersion: 'image-only-v1',
      episodeId,
      canonicalLocalizationId: localizationId,
      scenes: storyboard.draft.scenes,
      selectedScenes,
      assets,
    });

    const payload = buildEpisodeVisualPayload({
      visualVersion: 'image-only-v1',
      visualHash,
      episodeId,
      canonicalLocalizationId: localizationId,
      manifestUrl:
        'https://cdn.example.test/episodes/episode/visual-manifest.json',
      storyboard,
      selectedScenes,
      assets,
      r2ImageUrls: {
        'image-01': 'https://cdn.example.test/visuals/image-01.jpg',
        'image-02': 'https://cdn.example.test/visuals/image-02.webp',
      },
    });

    expect(payload.visualPlan.scenes).toHaveLength(3);
    expect(payload.visualPlan.scenes[0]?.asset.url).toBe(
      payload.visualPlan.scenes[2]?.asset.url,
    );
    expect(
      payload.visualPlan.scenes.every(
        (scene) => scene.asset.kind === 'remoteImage',
      ),
    ).toBe(true);
    expect(JSON.stringify(payload.visualPlan)).not.toMatch(
      /headline|subheadline|quote|facts|excerpt/,
    );
    expect(parseEpisodeVisualPayload(payload)).toEqual(payload);
  });

  it('includes source selection in the immutable visual hash', () => {
    const base = {
      visualVersion: 'image-only-v1',
      episodeId,
      canonicalLocalizationId: localizationId,
      scenes: storyboard.draft.scenes,
      selectedScenes: [
        { sceneId: 'scene-01', assetId: 'image-01' },
        { sceneId: 'scene-02', assetId: 'image-02' },
        { sceneId: 'scene-03', assetId: 'image-01' },
      ],
      assets,
    };
    const first = hashEpisodeVisualSelection(base);
    const second = hashEpisodeVisualSelection({
      ...base,
      assets: [
        {
          ...assets[0]!,
          originalImageUrl: 'https://images.example.test/replacement.jpg',
        },
        assets[1]!,
      ],
    });

    expect(first).toMatch(/^[a-f\d]{64}$/);
    expect(second).not.toBe(first);
  });
});
