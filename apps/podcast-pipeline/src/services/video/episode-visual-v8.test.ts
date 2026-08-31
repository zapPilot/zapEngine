import { describe, expect, it } from 'vitest';

import {
  buildEpisodeVisualPayload,
  hashEpisodeVisualSelection,
} from './episode-visual.js';
import type { StoryboardGenerationResult } from './storyboard/orchestrator.js';
import type {
  VisualSceneSubjectAssignment,
  VisualSubjectCatalog,
} from './storyboard/subject-catalog.js';
import type { PlannedVisualImage } from './visual-asset-planner.js';

const episodeId = '00000000-0000-4000-8000-000000000011';
const localizationId = '00000000-0000-4000-8000-000000000012';

const storyboard: StoryboardGenerationResult = {
  draft: {
    scenes: [
      {
        sceneId: 'scene-01',
        startSentenceId: 's0001',
        endSentenceId: 's0001',
        imageSearchIntent: ['Coinbase tokenized stocks'],
        imageSearchEntities: ['Coinbase'],
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

const catalog: VisualSubjectCatalog = {
  primarySubjectId: 'subject-coinbase',
  subjects: [
    {
      id: 'subject-coinbase',
      canonicalName: 'Coinbase',
      type: 'company',
      aliases: [],
      storyRole: 'primary',
      evidenceSceneIds: ['scene-01'],
      searchQueries: ['Coinbase tokenized stocks'],
      identityHints: ['crypto exchange', 'Base'],
      negativeHints: [],
      officialDomains: [],
    },
  ],
};

const assignments: VisualSceneSubjectAssignment[] = [
  {
    sceneId: 'scene-01',
    subjectIds: ['subject-coinbase'],
    selectionReason: 'direct',
  },
];

const wideAsset: PlannedVisualImage = {
  assetId: 'image-01',
  path: '/work/image-01.jpg',
  contentType: 'image/jpeg',
  sha256: 'a'.repeat(64),
  perceptualHash: '0'.repeat(16),
  width: 1920,
  height: 1080,
  originalImageUrl: 'https://images.example.test/coinbase.jpg',
  sourcePageUrl: 'https://news.example.test/coinbase',
  provider: 'brave',
  license: 'unknown',
};

describe('episode visual v8 context', () => {
  it('persists the subject catalog, assignment reason and full-image presentation', () => {
    const selectedScenes = [{ sceneId: 'scene-01', assetId: 'image-01' }];
    const visualHash = hashEpisodeVisualSelection({
      visualVersion: 'podcast-image-visual-plan.v8',
      episodeId,
      canonicalLocalizationId: localizationId,
      scenes: storyboard.draft.scenes,
      selectedScenes,
      assets: [wideAsset],
      subjectCatalog: catalog,
      sceneAssignments: assignments,
    });
    const payload = buildEpisodeVisualPayload({
      visualVersion: 'podcast-image-visual-plan.v8',
      visualHash,
      episodeId,
      canonicalLocalizationId: localizationId,
      manifestUrl: 'https://cdn.example.test/visual-manifest.json',
      storyboard,
      searchIntentModel: 'deepseek/deepseek-v4-flash-0731',
      selectedScenes,
      assets: [wideAsset],
      r2ImageUrls: {
        'image-01': 'https://cdn.example.test/image-01.jpg',
      },
      subjectCatalog: catalog,
      sceneAssignments: assignments,
    });

    expect(payload.subjectCatalog?.primarySubjectId).toBe('subject-coinbase');
    expect(payload.sceneAssignments).toEqual(assignments);
    expect(payload.visualPlan.scenes[0]?.asset).toMatchObject({
      layout: 'contain',
      position: 'center',
      motion: 'static',
    });
  });

  it('includes editorial assignment changes in the immutable visual hash', () => {
    const base = {
      visualVersion: 'podcast-image-visual-plan.v8',
      episodeId,
      canonicalLocalizationId: localizationId,
      scenes: storyboard.draft.scenes,
      selectedScenes: [{ sceneId: 'scene-01', assetId: 'image-01' }],
      assets: [wideAsset],
      subjectCatalog: catalog,
    };
    const direct = hashEpisodeVisualSelection({
      ...base,
      sceneAssignments: assignments,
    });
    const contextual = hashEpisodeVisualSelection({
      ...base,
      sceneAssignments: [
        { ...assignments[0]!, selectionReason: 'episode-context' as const },
      ],
    });

    expect(direct).not.toBe(contextual);
  });
});
