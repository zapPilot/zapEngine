import { describe, expect, it } from 'vitest';

import {
  buildEpisodeVisualPayload,
  hashEpisodeVisualSelection,
  parseEpisodeVisualPayload,
} from './episode-visual.js';
import type { StoryboardGenerationResult } from './storyboard/orchestrator.js';
import type { PlannedVisualImage } from './visual-asset-planner.js';
import { EPISODE_VIDEO_VISUAL_VERSION } from '../video-jobs.js';

const episodeId = '00000000-0000-4000-8000-000000000001';
const localizationId = '00000000-0000-4000-8000-000000000002';

const storyboard: StoryboardGenerationResult = {
  draft: {
    scenes: [
      {
        sceneId: 'scene-01',
        startSentenceId: 's0001',
        endSentenceId: 's0001',
        imageSearchIntent: ['Justin Sun crypto entrepreneur'],
        imageSearchEntities: ['Justin Sun'],
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

const asset: PlannedVisualImage = {
  assetId: 'image-01',
  path: '/work/image-01.jpg',
  contentType: 'image/jpeg',
  sha256: 'a'.repeat(64),
  perceptualHash: '0'.repeat(16),
  width: 1920,
  height: 1080,
  originalImageUrl: 'https://images.example.test/justin-sun.jpg',
  sourcePageUrl: 'https://www.reuters.com/example/justin-sun',
  provider: 'brave',
  license: 'unknown',
};

describe('episode visual v9 provenance', () => {
  it('persists the search title source, article-image counts, and provider funnel', () => {
    const selectedScenes = [{ sceneId: 'scene-01', assetId: 'image-01' }];
    const visualHash = hashEpisodeVisualSelection({
      visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
      episodeId,
      canonicalLocalizationId: localizationId,
      scenes: storyboard.draft.scenes,
      selectedScenes,
      assets: [asset],
    });

    const payload = buildEpisodeVisualPayload({
      visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
      visualHash,
      episodeId,
      canonicalLocalizationId: localizationId,
      manifestUrl: 'https://cdn.example.test/visual-manifest.json',
      storyboard,
      searchIntentModel: 'deepseek/deepseek-v4-flash-0731',
      selectedScenes,
      assets: [asset],
      r2ImageUrls: {
        'image-01': 'https://cdn.example.test/image-01.jpg',
      },
      searchTitleSource: 'publisher',
      articleImageCandidateCount: 2,
      searchTrace: [
        {
          sceneId: 'scene-01',
          provider: 'pexels',
          intent: 'Justin Sun crypto entrepreneur',
          subjectKey: 'justin sun',
          returned: 80,
          accepted: 0,
          entityFiltered: 80,
          rejected: 0,
        },
        {
          sceneId: 'scene-01',
          provider: 'brave',
          intent: 'Justin Sun crypto entrepreneur',
          subjectKey: 'justin sun',
          returned: 50,
          accepted: 9,
          entityFiltered: 41,
          rejected: 0,
        },
      ],
    });

    expect(payload.visualVersion).toBe('podcast-image-visual-plan.v9');
    expect(payload.provenance).toMatchObject({
      searchTitleSource: 'publisher',
      articleImageCandidateCount: 2,
      articleImageAssetCount: 0,
      searchTrace: [
        expect.objectContaining({
          provider: 'pexels',
          entityFiltered: 80,
          accepted: 0,
        }),
        expect.objectContaining({
          provider: 'brave',
          accepted: 9,
        }),
      ],
    });
    expect(parseEpisodeVisualPayload(payload)).toEqual(payload);
  });
});
