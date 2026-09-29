import { describe, expect, it } from 'vitest';

import {
  buildEpisodeVisualPayload,
  parseEpisodeVisualPayload,
  sceneSentencesForDraft,
} from './episode-visual.js';
import type { StoryboardGenerationResult } from './storyboard/orchestrator.js';
import type { PlannedVisualImage } from './visual-asset-planner.js';

const episodeId = '00000000-0000-4000-8000-000000000011';
const localizationId = '00000000-0000-4000-8000-000000000012';

function storyboard(sceneCount = 1): StoryboardGenerationResult {
  return {
    draft: {
      scenes: Array.from({ length: sceneCount }, (_, index) => ({
        sceneId: `scene-${String(index + 1).padStart(2, '0')}`,
        startSentenceId: `s${String(index + 1).padStart(4, '0')}`,
        endSentenceId: `s${String(index + 1).padStart(4, '0')}`,
        imageSearchIntent: ['subject photo'],
      })),
    },
    effectiveProvider: 'deterministic',
    requestedProvider: 'deterministic',
    model: 'deterministic-v1',
    usedFallback: false,
    attempts: [],
    totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
}

function articleAsset(
  overrides: Partial<PlannedVisualImage> = {},
): PlannedVisualImage {
  return {
    assetId: 'image-01',
    path: '/work/image-01.jpg',
    contentType: 'image/jpeg',
    sha256: 'a'.repeat(64),
    perceptualHash: '0'.repeat(16),
    width: 1000,
    height: 1000,
    originalImageUrl: 'https://images.example.test/image.jpg',
    sourcePageUrl: 'https://publisher.example.test/article',
    provider: 'article',
    license: 'unknown',
    ...overrides,
  };
}

const slide = {
  templateVersion: 'concept-card-v1' as const,
  kicker: 'WHY IT MATTERS',
  headline: 'A generated concept card',
  points: ['First point', 'Second point'],
  copySource: 'deterministic' as const,
  model: null,
  reason: 'candidate-exhaustion' as const,
  rejectionSummary: null,
  lead: false,
  costUsd: null,
};

function generatedAsset(
  overrides: Partial<PlannedVisualImage> = {},
): PlannedVisualImage {
  return articleAsset({
    provider: 'generated-slide',
    license: 'brand-generated',
    contentType: 'image/png',
    originalImageUrl: 'https://www.zap-pilot.org',
    sourcePageUrl: 'https://www.zap-pilot.org',
    slide,
    ...overrides,
  });
}

function buildOne(asset = articleAsset()) {
  return buildEpisodeVisualPayload({
    visualVersion: 'visual-v-test',
    visualHash: 'b'.repeat(64),
    episodeId,
    canonicalLocalizationId: localizationId,
    manifestUrl: 'https://cdn.example.test/manifest.json',
    storyboard: storyboard(),
    searchIntentModel: null,
    selectedScenes: [{ sceneId: 'scene-01', assetId: asset.assetId }],
    assets: [asset],
    r2ImageUrls: { [asset.assetId]: 'https://cdn.example.test/image-01.png' },
  });
}

const subjectCatalog = {
  primarySubjectId: 'subject-primary',
  subjects: [
    {
      id: 'subject-primary',
      canonicalName: 'Primary Company',
      type: 'company' as const,
      aliases: [],
      storyRole: 'primary' as const,
      evidenceSceneIds: ['scene-01'],
      searchQueries: ['Primary Company'],
      identityHints: ['company'],
      negativeHints: [],
      officialDomains: [],
    },
  ],
};

describe('episode visual coverage edges', () => {
  it('rejects subject context when only half of the pair is present', () => {
    const valid = buildOne();
    expect(() =>
      parseEpisodeVisualPayload({ ...valid, subjectCatalog }),
    ).toThrow('must be stored together');
  });

  it('rejects assignments that reference unknown scenes or subjects', () => {
    const valid = buildOne();
    expect(() =>
      parseEpisodeVisualPayload({
        ...valid,
        subjectCatalog,
        sceneAssignments: [
          {
            sceneId: 'scene-99',
            subjectIds: ['subject-primary'],
            selectionReason: 'direct',
          },
        ],
      }),
    ).toThrow('references unknown scene scene-99');
    expect(() =>
      parseEpisodeVisualPayload({
        ...valid,
        subjectCatalog,
        sceneAssignments: [
          {
            sceneId: 'scene-01',
            subjectIds: ['subject-missing'],
            selectionReason: 'direct',
          },
        ],
      }),
    ).toThrow('references unknown subject subject-missing');
  });

  it('omits a scene sentence when its canonical range cannot be resolved', () => {
    expect(
      sceneSentencesForDraft('Only one sentence.', {
        scenes: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's9998',
            endSentenceId: 's9999',
            imageSearchIntent: ['missing'],
          },
        ],
      }),
    ).toEqual([]);
    expect(
      sceneSentencesForDraft('Only one sentence.', {
        scenes: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
            imageSearchIntent: ['present'],
          },
        ],
      }),
    ).toEqual([{ sceneId: 'scene-01', text: 'Only one sentence.' }]);
  });

  it('uses full-bleed presentation for a near-square editorial image and persists lead-cover metadata', () => {
    const asset = articleAsset();
    const payload = buildEpisodeVisualPayload({
      visualVersion: 'visual-v-test',
      visualHash: 'c'.repeat(64),
      episodeId,
      canonicalLocalizationId: localizationId,
      manifestUrl: 'https://cdn.example.test/manifest.json',
      storyboard: storyboard(),
      searchIntentModel: null,
      selectedScenes: [{ sceneId: 'scene-01', assetId: asset.assetId }],
      assets: [asset],
      r2ImageUrls: { 'image-01': 'https://cdn.example.test/image-01.jpg' },
      leadCover: {
        imageUrl: 'https://images.example.test/image.jpg',
        fallbackReason: null,
      },
    });

    expect(payload.visualPlan.scenes[0]?.asset).toMatchObject({
      layout: 'fullBleed',
      motion: 'pushIn',
    });
    expect(payload.provenance.leadCoverImageUrl).toBe(
      'https://images.example.test/image.jpg',
    );
  });

  it('stores and credits a generated slide as a contained Zap Pilot image', () => {
    const asset = generatedAsset();
    const payload = buildEpisodeVisualPayload({
      visualVersion: 'visual-v-test',
      visualHash: 'e'.repeat(64),
      episodeId,
      canonicalLocalizationId: localizationId,
      manifestUrl: 'https://cdn.example.test/manifest.json',
      storyboard: storyboard(),
      searchIntentModel: null,
      selectedScenes: [{ sceneId: 'scene-01', assetId: asset.assetId }],
      assets: [asset],
      r2ImageUrls: { 'image-01': 'https://cdn.example.test/image-01.png' },
      sceneSentences: [{ sceneId: 'scene-01', text: 'Scene sentence' }],
    });

    expect(payload.visualPlan.scenes[0]?.sources[0]?.attribution).toBe(
      'Zap Pilot · generated concept card',
    );
    expect(payload.assets[0]?.slide).toEqual(slide);
    expect(payload.provenance.generatedSlideSceneIds).toEqual(['scene-01']);
    expect(payload.provenance.sceneSentences).toEqual([
      { sceneId: 'scene-01', text: 'Scene sentence' },
    ]);
  });

  it('rejects mismatched generated-slide metadata and a non-PNG slide', () => {
    const valid = buildOne();
    expect(() =>
      parseEpisodeVisualPayload({
        ...valid,
        assets: [{ ...valid.assets[0]!, slide }],
      }),
    ).toThrow('provider and metadata must appear together');

    const generated = buildOne(generatedAsset());
    expect(() =>
      parseEpisodeVisualPayload({
        ...generated,
        assets: [{ ...generated.assets[0]!, contentType: 'image/jpeg' }],
      }),
    ).toThrow('Generated slide assets must be PNG');
  });

  it('rejects reuse of one generated slide by multiple scenes', () => {
    const asset = generatedAsset();
    expect(() =>
      buildEpisodeVisualPayload({
        visualVersion: 'visual-v-test',
        visualHash: 'd'.repeat(64),
        episodeId,
        canonicalLocalizationId: localizationId,
        manifestUrl: 'https://cdn.example.test/manifest.json',
        storyboard: storyboard(2),
        searchIntentModel: null,
        selectedScenes: [
          { sceneId: 'scene-01', assetId: asset.assetId },
          { sceneId: 'scene-02', assetId: asset.assetId },
        ],
        assets: [asset],
        r2ImageUrls: { 'image-01': 'https://cdn.example.test/image-01.png' },
      }),
    ).toThrow('Generated slide assets must be scene-specific');
  });

  it('rejects an unused generated slide asset as not scene-specific', () => {
    const valid = buildOne(generatedAsset());
    const unusedSlide = {
      ...valid.assets[0]!,
      assetId: 'image-02',
      r2Url: 'https://cdn.example.test/image-02.png',
    };

    expect(() =>
      parseEpisodeVisualPayload({
        ...valid,
        assets: [...valid.assets, unusedSlide],
      }),
    ).toThrow('Generated slide assets must be scene-specific');
  });
});
