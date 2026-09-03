import { describe, expect, it, vi } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import type { AcquiredRemoteImage } from './assets.js';
import type { ImageSearchProvider } from './image-search-provider.js';
import {
  planVisualAssets,
  type VisualAssetProgress,
  type VisualAssetScene,
} from './visual-asset-planner.js';

function candidate(
  id: string,
  origin: ImageCandidate['origin'] = 'article',
): ImageCandidate {
  return {
    imageUrl: `https://images.example.test/${id}.jpg`,
    sourceUrl: `https://publisher.example.test/${id}`,
    origin,
    width: 1_920,
    height: 1_080,
    altText: id.replaceAll('-', ' '),
  };
}

function braveCandidate(id: string, altText: string): ImageCandidate {
  return { ...candidate(id, 'brave'), altText };
}

function acquired(id: string): AcquiredRemoteImage {
  return {
    path: `/work/${id}.jpg`,
    contentType: 'image/jpeg',
    sha256: id.padEnd(64, 'a').slice(0, 64),
    width: 1_920,
    height: 1_080,
  };
}

/** One search per subject means the pool decides the download order, so a
 * fixture keyed by call index would no longer describe anything. */
function acquireByUrl(url: string): Promise<AcquiredRemoteImage> {
  const filename = new URL(url).pathname.split('/').at(-1) ?? '';
  return Promise.resolve(acquired(filename.replace('.jpg', '')));
}

const HASH_NIBBLES = '0123456789abcdef';

/** A stable, far-apart perceptual hash per downloaded path. Two different
 * nibbles differ in every one of the sixteen positions, so no pair of these
 * falls inside the planner's duplicate-image distance. */
function distinctFingerprints(): (path: string) => Promise<string> {
  const assigned = new Map<string, string>();
  return (path: string) => {
    const existing = assigned.get(path);
    if (existing !== undefined) return Promise.resolve(existing);
    const hash = (HASH_NIBBLES[assigned.size] ?? 'f').repeat(16);
    assigned.set(path, hash);
    return Promise.resolve(hash);
  };
}

function braveProvider(
  search: ImageSearchProvider['search'],
  maxResults?: number,
): ImageSearchProvider {
  return {
    origin: 'brave',
    ...(maxResults === undefined ? {} : { maxResults }),
    search,
  };
}

const twoScenes: VisualAssetScene[] = [
  { sceneId: 'scene-01', imageSearchIntent: ['first subject'] },
  { sceneId: 'scene-02', imageSearchIntent: ['second subject'] },
];

describe('planVisualAssets resilient selection', () => {
  it('uses the immediately preceding image as the final production fallback for generic scenes', async () => {
    const progress: VisualAssetProgress[] = [];

    const result = await planVisualAssets({
      scenes: twoScenes,
      articleImages: [candidate('article-a')],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      onProgress: (event) => progress.push(event),
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('article-a')),
        searchProviders: [braveProvider(vi.fn().mockResolvedValue([]))],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(result.assets).toHaveLength(1);
    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-01' },
    ]);
    expect(progress).toContainEqual(
      expect.objectContaining({
        phase: 'assets',
        sceneId: 'scene-02',
        provider: 'reuse',
        reuseKind: 'consecutive',
        assetId: 'image-01',
        sourceHostname: 'publisher.example.test',
      }),
    );
  });

  it('drops a synthetic Brave result and prefers the editorial source over generic stock', async () => {
    const synthetic = braveCandidate(
      'federal-reserve-ai-art',
      'AI-generated 3D render of a Federal Reserve policy meeting',
    );
    const genericStock = braveCandidate(
      'federal-reserve-business-team',
      'Federal Reserve business team meeting in office',
    );
    const editorial = {
      ...braveCandidate(
        'federal-reserve-chair',
        'Federal Reserve chair speaking after a policy meeting',
      ),
      sourceUrl:
        'https://www.reuters.com/world/us/federal-reserve-policy-meeting/',
    };
    const braveSearch = vi
      .fn()
      .mockResolvedValue([synthetic, genericStock, editorial]);
    const acquireImage = vi.fn().mockResolvedValue(acquired('editorial'));
    const progress: VisualAssetProgress[] = [];

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['Federal Reserve policy meeting photo'],
          imageSearchEntities: ['Federal Reserve'],
        },
      ],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      onProgress: (event) => progress.push(event),
      dependencies: {
        acquireImage,
        searchProviders: [braveProvider(braveSearch)],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(braveSearch).toHaveBeenCalledOnce();
    expect(acquireImage).toHaveBeenCalledOnce();
    expect(acquireImage).toHaveBeenCalledWith(
      editorial.imageUrl,
      expect.any(Object),
    );
    expect(result.assets[0]?.provider).toBe('brave');
    expect(result.assets[0]?.sourcePageUrl).toBe(editorial.sourceUrl);
    expect(progress).toContainEqual(
      expect.objectContaining({
        phase: 'search',
        provider: 'brave',
        searchIntent: 'Federal Reserve policy meeting photo',
        subjectKey: 'federal reserve',
        searchResultCount: 3,
        candidateCount: 2,
      }),
    );
    expect(result.imageSearch?.requests[0]?.drops).toContainEqual({
      reason: 'synthetic-image',
      count: 1,
    });
  });

  it('does not consume publisher article imagery as the lead named cover', async () => {
    const article = candidate('publisher-cover');
    article.sourceUrl = 'https://publisher.example.test/story';
    const searched = braveCandidate(
      'justin-sun-interview',
      'Justin Sun interview portrait',
    );
    const braveSearch = vi.fn(async (query: string) =>
      query.includes('Justin Sun') ? [searched] : [],
    );
    const acquireImage = vi.fn(async (url: string) =>
      url.includes('publisher-cover')
        ? acquired('publisher-cover')
        : acquired('justin-sun-interview'),
    );

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['Justin Sun crypto entrepreneur'],
          imageSearchEntities: ['Justin Sun'],
        },
        { sceneId: 'scene-02', imageSearchIntent: ['crypto market'] },
      ],
      articleImages: [article],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage,
        searchProviders: [braveProvider(braveSearch)],
        fingerprintImage: vi
          .fn()
          .mockResolvedValueOnce('0000000000000000')
          .mockResolvedValueOnce('ffffffffffffffff'),
      },
    });

    expect(result.assets[0]?.provider).toBe('brave');
    expect(result.assets[1]?.provider).toBe('article');
    expect(result.scenes[0]?.assetId).toBe('image-01');
    expect(result.scenes[1]?.assetId).toBe('image-02');
  });

  it('respects provider result ceilings when requesting a large candidate pool', async () => {
    const braveSearch = vi
      .fn()
      .mockResolvedValue([braveCandidate('crypto-desk', 'crypto market desk')]);

    const result = await planVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['crypto market'] }],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('crypto-desk')),
        searchProviders: [braveProvider(braveSearch, 80)],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(braveSearch).toHaveBeenCalledWith(
      'crypto market',
      expect.objectContaining({ count: 80 }),
    );
    expect(result.assets[0]?.provider).toBe('brave');
  });

  it('caches identical provider queries across scenes and requests 100 candidates', async () => {
    const results = [
      { ...candidate('market-a', 'brave'), altText: 'crypto market overview' },
      { ...candidate('market-b', 'brave'), altText: 'crypto market trading' },
    ];
    const braveSearch = vi.fn().mockResolvedValue(results);
    const acquireImage = vi
      .fn()
      .mockResolvedValueOnce(acquired('market-a'))
      .mockResolvedValueOnce(acquired('market-b'));

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['crypto market'],
          imageSearchEntities: ['crypto market'],
        },
        {
          sceneId: 'scene-02',
          imageSearchIntent: ['  CRYPTO   MARKET  '],
          imageSearchEntities: ['crypto market'],
        },
      ],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage,
        searchProviders: [braveProvider(braveSearch)],
        fingerprintImage: vi
          .fn()
          .mockResolvedValueOnce('0000000000000000')
          .mockResolvedValueOnce('ffffffffffffffff'),
      },
    });

    expect(braveSearch).toHaveBeenCalledOnce();
    expect(braveSearch).toHaveBeenCalledWith(
      'crypto market',
      expect.objectContaining({ count: 100 }),
    );
    expect(result.assets).toHaveLength(2);
  });

  it('searches every primary subject exactly once, on its first intent', async () => {
    const braveSearch = vi.fn(async (query: string) => [
      braveCandidate(query.toLowerCase().replaceAll(' ', '-'), query),
    ]);

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['Alpha one', 'Alpha two', 'Alpha three'],
          imageSearchEntities: ['Alpha'],
        },
        {
          sceneId: 'scene-02',
          imageSearchIntent: ['Beta one', 'Beta two'],
          imageSearchEntities: ['Beta'],
        },
        {
          sceneId: 'scene-03',
          imageSearchIntent: ['Gamma one'],
          imageSearchEntities: ['Gamma'],
        },
        {
          sceneId: 'scene-04',
          imageSearchIntent: ['Delta one'],
          imageSearchEntities: ['Delta'],
        },
      ],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: [braveProvider(braveSearch)],
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    expect(braveSearch.mock.calls.map(([query]) => query)).toEqual([
      'Alpha one',
      'Beta one',
      'Gamma one',
      'Delta one',
    ]);
    expect(result.imageSearch?.requests.map((request) => request.kind)).toEqual(
      ['primary', 'primary', 'primary', 'primary'],
    );
    expect(result.assets).toHaveLength(4);
    expect(result.assets.every((asset) => asset.provider === 'brave')).toBe(
      true,
    );
  });

  it('caps an episode at five primary plus three targeted requests and still images every scene', async () => {
    const braveSearch = vi.fn(async (query: string) => [
      braveCandidate(
        query.toLowerCase().replaceAll(' ', '-'),
        `${query} portrait`,
      ),
    ]);

    const result = await planVisualAssets({
      scenes: Array.from({ length: 9 }, (_, index) => ({
        sceneId: `scene-0${index + 1}`,
        imageSearchIntent: [`Subject ${index + 1}`],
        imageSearchEntities: [`Subject ${index + 1}`],
      })),
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: [braveProvider(braveSearch)],
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    expect(braveSearch).toHaveBeenCalledTimes(8);
    expect(result.imageSearch?.requests.map((request) => request.kind)).toEqual(
      [
        'primary',
        'primary',
        'primary',
        'primary',
        'primary',
        'targeted',
        'targeted',
        'targeted',
      ],
    );
    expect(result.imageSearch?.budget).toEqual({
      primary: 5,
      targeted: 3,
      max: 8,
    });
    expect(result.imageSearch?.budgetExhausted).toBe(true);
    expect(result.assets).toHaveLength(8);

    const assetIds = new Set(result.assets.map((asset) => asset.assetId));
    expect(result.scenes).toHaveLength(9);
    expect(result.scenes.every((scene) => assetIds.has(scene.assetId))).toBe(
      true,
    );
    expect(
      result.imageSearch?.scenes.find((scene) => scene.sceneId === 'scene-09'),
    ).toMatchObject({ selection: 'reuse', fallbackReason: 'pool-exhausted' });
  });

  it('rotates a six-image subject pool instead of searching for endless visual novelty', async () => {
    const progress: VisualAssetProgress[] = [];
    const braveSearch = vi
      .fn()
      .mockResolvedValue(
        ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((suffix) =>
          braveCandidate(
            `justin-sun-${suffix}`,
            `Justin Sun portrait ${suffix.toUpperCase()}`,
          ),
        ),
      );

    const result = await planVisualAssets({
      scenes: Array.from({ length: 7 }, (_, index) => ({
        sceneId: `scene-0${index + 1}`,
        imageSearchIntent: ['Justin Sun crypto entrepreneur'],
        imageSearchEntities: ['Justin Sun'],
      })),
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      onProgress: (event) => progress.push(event),
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: [braveProvider(braveSearch)],
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    expect(braveSearch).toHaveBeenCalledOnce();
    expect(result.assets).toHaveLength(6);
    expect(result.scenes[6]?.assetId).toBe('image-01');
    expect(progress).toContainEqual(
      expect.objectContaining({
        phase: 'assets',
        sceneId: 'scene-07',
        provider: 'reuse',
        subjectKey: 'justin sun',
      }),
    );
  });

  it('prefers a non-consecutive reusable image and records provider failures for generic scenes', async () => {
    const progress: VisualAssetProgress[] = [];
    const search = vi.fn().mockRejectedValue(new Error('provider offline'));

    const result = await planVisualAssets({
      scenes: [
        ...twoScenes,
        { sceneId: 'scene-03', imageSearchIntent: ['third subject'] },
      ],
      articleImages: [candidate('article-a'), candidate('article-b')],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      onProgress: (event) => progress.push(event),
      dependencies: {
        acquireImage: vi
          .fn()
          .mockResolvedValueOnce(acquired('article-a'))
          .mockResolvedValueOnce(acquired('article-b')),
        searchProviders: [braveProvider(search)],
        fingerprintImage: vi
          .fn()
          .mockResolvedValueOnce('0000000000000000')
          .mockResolvedValueOnce('ffffffffffffffff'),
      },
    });

    expect(result.scenes[2]).toEqual({
      sceneId: 'scene-03',
      assetId: 'image-01',
    });
    expect(progress).toContainEqual(
      expect.objectContaining({
        phase: 'assets',
        sceneId: 'scene-03',
        provider: 'reuse',
        reuseKind: 'non-consecutive',
        rejectedCandidateCount: expect.any(Number),
        rejectionSummary: expect.stringContaining('search-provider-failure'),
      }),
    );
  });

  it('records provider failures and still completes a generic scene from an existing image', async () => {
    const progress: VisualAssetProgress[] = [];
    const search = vi
      .fn()
      .mockRejectedValue(new Error('Brave Images search failed: 503'));

    const result = await planVisualAssets({
      scenes: twoScenes,
      articleImages: [candidate('article-a')],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      onProgress: (event) => progress.push(event),
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('article-a')),
        searchProviders: [braveProvider(search)],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(search).toHaveBeenCalledOnce();
    expect(result.scenes[1]?.assetId).toBe('image-01');
    expect(result.imageSearch?.requests[0]?.error).toBe(
      'Brave Images search failed: 503',
    );
    expect(progress).toContainEqual(
      expect.objectContaining({
        phase: 'assets',
        sceneId: 'scene-02',
        provider: 'reuse',
        reuseKind: 'consecutive',
        rejectedCandidateCount: 1,
        rejectionSummary: 'search-provider-failure:1',
      }),
    );
  });

  it('lets a named subject that found nothing borrow an already-selected image', async () => {
    const braveSearch = vi.fn(async (query: string) =>
      query.includes('stablecoin')
        ? [braveCandidate('stablecoin-desk', 'stablecoin trading desk')]
        : [],
    );

    const result = await planVisualAssets({
      scenes: [
        { sceneId: 'scene-01', imageSearchIntent: ['stablecoin desk'] },
        {
          sceneId: 'scene-02',
          imageSearchIntent: ['Coldcard air-gapped signing device'],
          imageSearchEntities: ['Coldcard'],
        },
      ],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('stablecoin-desk')),
        searchProviders: [braveProvider(braveSearch)],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(braveSearch.mock.calls.map(([query]) => query)).toEqual([
      'stablecoin desk',
      'Coldcard air-gapped signing device',
    ]);
    expect(result.assets).toHaveLength(1);
    expect(result.scenes[1]).toEqual({
      sceneId: 'scene-02',
      assetId: 'image-01',
    });
    expect(
      result.imageSearch?.scenes.find((scene) => scene.sceneId === 'scene-02'),
    ).toMatchObject({
      subjectKey: 'coldcard',
      selection: 'reuse',
      fallbackReason: 'pool-exhausted',
    });
  });
});
