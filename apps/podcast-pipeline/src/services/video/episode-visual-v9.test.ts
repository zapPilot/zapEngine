import { describe, expect, it } from 'vitest';

import { EPISODE_VIDEO_VISUAL_VERSION } from '../video-jobs.js';
import {
  fixtureAssignments,
  fixtureCatalog,
  fixtureQualityReport,
} from './__fixtures__/identity-catalog.js';
import {
  buildEpisodeVisualPayload,
  hashEpisodeVisualSelection,
  parseEpisodeVisualPayload,
} from './episode-visual.js';
import type { VisualImageSearch } from './image-search-trace.js';
import type { EnrichedStoryboardGenerationResult } from './storyboard/orchestrator.js';
import type { PlannedVisualImage } from './visual-asset-planner.js';

const episodeId = '00000000-0000-4000-8000-000000000001';
const localizationId = '00000000-0000-4000-8000-000000000002';

const storyboard: EnrichedStoryboardGenerationResult = {
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
  const selectedScenes = [{ sceneId: 'scene-01', assetId: 'image-01' }];
  const imageSearch: VisualImageSearch = {
    requestCount: 1,
    budget: { primary: 5, targeted: 3, max: 8 },
    budgetExhausted: false,
    primarySubjects: [
      {
        subjectKey: 'justin sun',
        subjectLabel: 'Justin Sun',
        query: 'Justin Sun',
        sceneCount: 1,
      },
    ],
    requests: [
      {
        kind: 'primary',
        subjectKey: 'justin sun',
        subjectLabel: 'Justin Sun',
        query: 'Justin Sun',
        sceneId: null,
        returned: 50,
        viable: 9,
        drops: [{ reason: 'decorative-asset', count: 41 }],
        candidates: [
          {
            imageUrl: 'https://images.example.test/justin-sun.jpg',
            sourceUrl: 'https://www.reuters.com/example/justin-sun',
            altText: 'Justin Sun at a press conference',
            providerRank: 0,
            dropReason: null,
          },
          {
            imageUrl: 'https://images.example.test/tron-logo.png',
            sourceUrl: 'https://tron.network/press',
            altText: null,
            providerRank: 1,
            dropReason: 'decorative-asset',
          },
        ],
        error: null,
      },
    ],
    resumedSceneCount: 0,
    scenes: [
      {
        sceneId: 'scene-01',
        subjectKey: 'justin sun',
        matchedSubjectKey: 'justin sun',
        selection: 'pool',
        sourceQuery: 'Justin Sun',
        providerRank: 0,
        fallbackReason: null,
        fallbackBasis: null,
        visualCue: null,
        cueMatched: null,
        rejections: [{ cause: 'perceptual-duplicate', count: 2 }],
      },
    ],
  };

  function buildPayload(
    overrides: Partial<Parameters<typeof buildEpisodeVisualPayload>[0]> = {},
  ) {
    return buildEpisodeVisualPayload({
      subjectCatalog: fixtureCatalog,
      sceneAssignments: fixtureAssignments(storyboard.draft),
      qualityReport: fixtureQualityReport,
      visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
      visualHash: hashEpisodeVisualSelection({
        subjectCatalog: fixtureCatalog,
        sceneAssignments: fixtureAssignments(storyboard.draft),
        visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
        episodeId,
        canonicalLocalizationId: localizationId,
        scenes: storyboard.draft.scenes,
        selectedScenes,
        assets: [asset],
      }),
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
      ...overrides,
    });
  }

  it('persists the search title source, article-image counts, and image-search trace', () => {
    const payload = buildPayload({ imageSearch });

    expect(payload.visualVersion).toBe(EPISODE_VIDEO_VISUAL_VERSION);
    expect(payload.provenance).toMatchObject({
      searchTitleSource: 'publisher',
      articleImageCandidateCount: 2,
      articleImageAssetCount: 0,
      imageSearch,
    });
    expect(payload.provenance.searchTrace).toBeUndefined();
    expect(parseEpisodeVisualPayload(payload)).toEqual(payload);
  });

  it('requires a completed visual quality report in stored provenance', () => {
    const payload = buildPayload();
    expect(payload.provenance.qualityReport.passed).toBe(true);
    const provenance = { ...payload.provenance, qualityReport: undefined };
    expect(() =>
      parseEpisodeVisualPayload({ ...payload, provenance }),
    ).toThrow();
  });

  it('keeps a stored per-provider search trace readable after the providers were retired', () => {
    const stored = {
      ...buildPayload(),
      provenance: {
        ...buildPayload().provenance,
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
      },
    };

    expect(parseEpisodeVisualPayload(stored).provenance.searchTrace).toEqual(
      stored.provenance.searchTrace,
    );
  });
});
