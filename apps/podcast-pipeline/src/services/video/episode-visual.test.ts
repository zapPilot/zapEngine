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
    provider: 'brave',
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
      searchIntentModel: 'openrouter/free',
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
    // Which model wrote the search intents is provenance, not decoration: it is
    // the only record of why a completed episode's images look the way they do.
    expect(payload.provenance.searchIntentModel).toBe('openrouter/free');
  });

  it('materializes stock attribution and optional photographer metadata', () => {
    const stockAssets: PlannedVisualImage[] = [
      {
        ...assets[0]!,
        assetId: 'image-01',
        provider: 'pexels',
        license: 'pexels',
        photographer: 'Ada Lens',
        photographerUrl: 'https://www.pexels.com/@ada-lens',
      },
      {
        ...assets[1]!,
        assetId: 'image-02',
        provider: 'pixabay',
        license: 'pixabay',
      },
    ];
    const selectedScenes = [
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-02' },
      { sceneId: 'scene-03', assetId: 'image-01' },
    ];
    const payload = buildEpisodeVisualPayload({
      visualVersion: 'image-only-v1',
      visualHash: hashEpisodeVisualSelection({
        visualVersion: 'image-only-v1',
        episodeId,
        canonicalLocalizationId: localizationId,
        scenes: storyboard.draft.scenes,
        selectedScenes,
        assets: stockAssets,
      }),
      episodeId,
      canonicalLocalizationId: localizationId,
      manifestUrl: 'https://cdn.example.test/manifest.json',
      storyboard,
      searchIntentModel: null,
      selectedScenes,
      assets: stockAssets,
      r2ImageUrls: {
        'image-01': 'https://cdn.example.test/image-01.jpg',
        'image-02': 'https://cdn.example.test/image-02.webp',
      },
    });

    expect(payload.assets[0]).toMatchObject({
      photographer: 'Ada Lens',
      photographerUrl: 'https://www.pexels.com/@ada-lens',
    });
    expect(payload.visualPlan.scenes[0]?.sources[0]).toMatchObject({
      attribution: 'Photo by Ada Lens · Pexels',
      licenseUrl: 'https://www.pexels.com/license/',
    });
    expect(payload.visualPlan.scenes[1]?.sources[0]).toMatchObject({
      attribution: 'Photo · Pixabay',
      licenseUrl: 'https://pixabay.com/service/license-summary/',
    });
  });

  it('records bundled branding without fabricating article provenance', () => {
    const brandAsset: PlannedVisualImage = {
      assetId: 'image-98',
      path: '/work/image-98.png',
      contentType: 'image/png',
      sha256: 'c'.repeat(64),
      perceptualHash: '1'.repeat(16),
      width: 2880,
      height: 2560,
      originalImageUrl: 'https://www.zap-pilot.org',
      sourcePageUrl: 'https://www.zap-pilot.org',
      provider: 'brand',
      license: 'brand-generated',
    };
    const brandedAssets = [brandAsset, assets[0]!];
    const selectedScenes = [
      { sceneId: 'scene-01', assetId: 'image-98' },
      { sceneId: 'scene-02', assetId: 'image-01' },
      { sceneId: 'scene-03', assetId: 'image-01' },
    ];

    const payload = buildEpisodeVisualPayload({
      visualVersion: 'image-only-v1',
      visualHash: hashEpisodeVisualSelection({
        visualVersion: 'image-only-v1',
        episodeId,
        canonicalLocalizationId: localizationId,
        scenes: storyboard.draft.scenes,
        selectedScenes,
        assets: brandedAssets,
      }),
      episodeId,
      canonicalLocalizationId: localizationId,
      manifestUrl: 'https://cdn.example.test/manifest.json',
      storyboard,
      searchIntentModel: null,
      selectedScenes,
      assets: brandedAssets,
      r2ImageUrls: {
        'image-98': 'https://cdn.example.test/image-98.png',
        'image-01': 'https://cdn.example.test/image-01.jpg',
      },
    });

    expect(payload.assets[0]).toMatchObject({
      provider: 'brand',
      license: 'brand-generated',
      originalImageUrl: 'https://www.zap-pilot.org',
      sourcePageUrl: 'https://www.zap-pilot.org',
    });
    expect(payload.visualPlan.scenes[0]?.sources[0]).toMatchObject({
      label: 'Zap Pilot',
      attribution: 'Zap Pilot',
      license: 'brand-generated',
    });
  });

  it('fails closed when scene selection, local assets, or uploaded URLs are missing', () => {
    const base = {
      visualVersion: 'image-only-v1',
      visualHash: 'a'.repeat(64),
      episodeId,
      canonicalLocalizationId: localizationId,
      manifestUrl: 'https://cdn.example.test/manifest.json',
      storyboard,
      searchIntentModel: null,
      assets,
      r2ImageUrls: {
        'image-01': 'https://cdn.example.test/image-01.jpg',
        'image-02': 'https://cdn.example.test/image-02.webp',
      },
    };

    expect(() =>
      buildEpisodeVisualPayload({
        ...base,
        selectedScenes: [
          { sceneId: 'scene-01', assetId: 'image-01' },
          { sceneId: 'scene-02', assetId: 'image-02' },
        ],
      }),
    ).toThrow('Visual image is missing for scene-03');

    expect(() =>
      buildEpisodeVisualPayload({
        ...base,
        selectedScenes: storyboard.draft.scenes.map((scene) => ({
          sceneId: scene.sceneId,
          assetId: 'image-99',
        })),
      }),
    ).toThrow('Visual image is missing for scene-01');

    expect(() =>
      buildEpisodeVisualPayload({
        ...base,
        selectedScenes: storyboard.draft.scenes.map((scene) => ({
          sceneId: scene.sceneId,
          assetId: 'image-01',
        })),
        r2ImageUrls: {},
      }),
    ).toThrow('Visual image is missing for scene-01');

    expect(() =>
      buildEpisodeVisualPayload({
        ...base,
        selectedScenes: storyboard.draft.scenes.map((scene) => ({
          sceneId: scene.sceneId,
          assetId: 'image-01',
        })),
        r2ImageUrls: { 'image-01': 'https://cdn.example.test/image-01.jpg' },
        assets: [assets[0]!, assets[1]!],
      }),
    ).toThrow('Uploaded image URL is missing for image-02');
  });

  it('rejects duplicate uploaded URLs and visual-plan references that do not match metadata', () => {
    const selectedScenes = storyboard.draft.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      assetId: scene.sceneId === 'scene-02' ? 'image-02' : 'image-01',
    }));
    const valid = buildEpisodeVisualPayload({
      visualVersion: 'image-only-v1',
      visualHash: 'b'.repeat(64),
      episodeId,
      canonicalLocalizationId: localizationId,
      manifestUrl: 'https://cdn.example.test/manifest.json',
      storyboard,
      searchIntentModel: null,
      selectedScenes,
      assets,
      r2ImageUrls: {
        'image-01': 'https://cdn.example.test/image-01.jpg',
        'image-02': 'https://cdn.example.test/image-02.webp',
      },
    });

    expect(() =>
      parseEpisodeVisualPayload({
        ...valid,
        assets: valid.assets.map((asset) => ({
          ...asset,
          r2Url: 'https://cdn.example.test/same.jpg',
        })),
      }),
    ).toThrow('Visual assets must use unique R2 URLs');

    expect(() =>
      parseEpisodeVisualPayload({
        ...valid,
        visualPlan: {
          ...valid.visualPlan,
          scenes: valid.visualPlan.scenes.map((scene, index) =>
            index === 0
              ? {
                  ...scene,
                  asset: { ...scene.asset, sha256: 'f'.repeat(64) },
                }
              : scene,
          ),
        },
      }),
    ).toThrow('references an unknown visual asset');
  });

  it('uses a safe attribution label even when an upstream source URL is malformed', () => {
    const malformed: PlannedVisualImage = {
      ...assets[0]!,
      sourcePageUrl: 'not a url',
    };
    expect(() =>
      buildEpisodeVisualPayload({
        visualVersion: 'image-only-v1',
        visualHash: 'c'.repeat(64),
        episodeId,
        canonicalLocalizationId: localizationId,
        manifestUrl: 'https://cdn.example.test/manifest.json',
        storyboard: {
          ...storyboard,
          draft: { scenes: [storyboard.draft.scenes[0]!] },
        },
        searchIntentModel: null,
        selectedScenes: [{ sceneId: 'scene-01', assetId: 'image-01' }],
        assets: [malformed],
        r2ImageUrls: { 'image-01': 'https://cdn.example.test/image-01.jpg' },
      }),
    ).toThrow();
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
