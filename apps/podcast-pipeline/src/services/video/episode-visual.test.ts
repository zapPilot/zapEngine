import { describe, expect, it } from 'vitest';

import {
  buildEpisodeVisualPayload,
  EPISODE_VISUAL_PAYLOAD_SCHEMA_VERSION,
  hashEpisodeVisualSelection,
  parseEpisodeVisualPayload,
} from './episode-visual.js';
import type { StoryboardGenerationResult } from './storyboard/orchestrator.js';
import type {
  PlannedVisualImage,
  PlannedVisualScene,
} from './visual-asset-planner.js';

const storyboard: StoryboardGenerationResult = {
  draft: {
    scenes: [
      {
        sceneId: 'scene-01',
        startSentenceId: 's0001',
        endSentenceId: 's0001',
        visual: {
          kind: 'photo',
          searchIntents: ['Coinbase product launch'],
          mustShowEntities: ['Coinbase'],
        },
      },
      {
        sceneId: 'scene-02',
        startSentenceId: 's0002',
        endSentenceId: 's0002',
        visual: {
          kind: 'diagram',
          layout: 'flow',
          nodes: [
            { id: 'policy', label: '政策' },
            { id: 'liquidity', label: '流動性' },
          ],
          edges: [{ from: 'policy', to: 'liquidity' }],
        },
      },
      {
        sceneId: 'scene-03',
        startSentenceId: 's0003',
        endSentenceId: 's0003',
        visual: { kind: 'dataCard', value: '5%', label: '利率' },
      },
    ],
  },
  effectiveProvider: 'deterministic',
  requestedProvider: 'deterministic',
  model: 'deterministic-hybrid-v1',
  usedFallback: false,
  attempts: [],
  totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
};

const image: PlannedVisualImage = {
  assetId: 'image-01',
  path: '/work/image-01.jpg',
  contentType: 'image/jpeg',
  sha256: 'a'.repeat(64),
  perceptualHash: 'b'.repeat(16),
  width: 1600,
  height: 900,
  originalImageUrl: 'https://images.example.com/coinbase.jpg',
  sourcePageUrl: 'https://publisher.example.com/coinbase',
  provider: 'article',
  license: 'unknown',
};

const selectedScenes: PlannedVisualScene[] = [
  { sceneId: 'scene-01', assetId: 'image-01' },
];

describe('episode visual payload', () => {
  it('stores a mixed hybrid plan with assets only for photo scenes', () => {
    const visualHash = hashEpisodeVisualSelection({
      visualVersion: 'hybrid-v1',
      episodeId: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      canonicalLocalizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      scenes: storyboard.draft.scenes,
      selectedScenes,
      assets: [image],
    });
    const payload = buildEpisodeVisualPayload({
      visualVersion: 'hybrid-v1',
      visualHash,
      episodeId: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      canonicalLocalizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      manifestUrl: 'https://cdn.example.com/visual-manifest.json',
      storyboard,
      selectedScenes,
      assets: [image],
      r2ImageUrls: {
        'image-01': 'https://cdn.example.com/visuals/image-01.jpg',
      },
    });

    expect(payload.schemaVersion).toBe(EPISODE_VISUAL_PAYLOAD_SCHEMA_VERSION);
    expect(payload.visualPlan.scenes.map((scene) => scene.actualKind)).toEqual([
      'photo',
      'diagram',
      'dataCard',
    ]);
    const photo = payload.visualPlan.scenes[0];
    expect(photo?.actualKind).toBe('photo');
    if (photo?.actualKind === 'photo') {
      expect(photo.asset.url).toContain('image-01.jpg');
    }
    expect(payload.assets).toHaveLength(1);
    expect(() => parseEpisodeVisualPayload(payload)).not.toThrow();
  });

  it('records an explicit diagram fallback when a photo cannot be grounded', () => {
    const visualHash = hashEpisodeVisualSelection({
      visualVersion: 'hybrid-v1',
      episodeId: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      canonicalLocalizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      scenes: storyboard.draft.scenes,
      selectedScenes: [],
      assets: [],
      failures: [{ sceneId: 'scene-01', reason: 'no-grounded-photo' }],
    });
    const payload = buildEpisodeVisualPayload({
      visualVersion: 'hybrid-v1',
      visualHash,
      episodeId: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      canonicalLocalizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      manifestUrl: 'https://cdn.example.com/visual-manifest.json',
      storyboard,
      selectedScenes: [],
      failures: [{ sceneId: 'scene-01', reason: 'no-grounded-photo' }],
      assets: [],
      r2ImageUrls: {},
    });

    expect(payload.assets).toEqual([]);
    expect(payload.visualPlan.scenes[0]).toMatchObject({
      actualKind: 'diagram',
      fallbackFrom: 'photo',
      fallbackReason: 'no-grounded-photo',
    });
  });
});
