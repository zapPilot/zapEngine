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

function acquired(id: string): AcquiredRemoteImage {
  return {
    path: `/work/${id}.jpg`,
    contentType: 'image/jpeg',
    sha256: id.padEnd(64, 'a').slice(0, 64),
    width: 1_920,
    height: 1_080,
  };
}

function braveProvider(
  search: ImageSearchProvider['search'],
): ImageSearchProvider {
  return { origin: 'brave', search };
}

const twoScenes: VisualAssetScene[] = [
  { sceneId: 'scene-01', imageSearchIntent: ['first subject'] },
  { sceneId: 'scene-02', imageSearchIntent: ['second subject'] },
];

describe('planVisualAssets resilient selection', () => {
  it('uses the immediately preceding image as the final production fallback', async () => {
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

  it('tries a broader official-event query on stock before reusing an image', async () => {
    const searched = {
      ...candidate('ethereum-validator-conference', 'pexels'),
      altText: 'Ethereum validator conference event',
      sourceUrl: 'https://ethereum.org/community/events/',
    };
    const search = vi.fn(async (query: string) =>
      query.includes('official event photo') ? [searched] : [],
    );
    const acquireImage = vi.fn(async (url: string) =>
      url.includes('article-a')
        ? acquired('article-a')
        : acquired('ethereum-validator-conference'),
    );

    const result = await planVisualAssets({
      scenes: [
        twoScenes[0]!,
        {
          sceneId: 'scene-02',
          imageSearchIntent: [
            'Ethereum validator economics developers office photo',
          ],
        },
      ],
      articleImages: [candidate('article-a')],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage,
        searchProviders: [{ origin: 'pexels', search }],
        fingerprintImage: vi
          .fn()
          .mockResolvedValueOnce('0000000000000000')
          .mockResolvedValueOnce('ffffffffffffffff'),
      },
    });

    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[1]?.[0]).toContain('official event photo');
    expect(result.scenes[1]).toEqual({
      sceneId: 'scene-02',
      assetId: 'image-02',
    });
  });

  it('prefers editorial Brave results and drops obvious synthetic artwork', async () => {
    const synthetic = {
      ...candidate('federal-reserve-ai-art', 'brave'),
      altText: 'AI-generated 3D render of a Federal Reserve policy meeting',
    };
    const genericStock = {
      ...candidate('federal-reserve-business-team', 'brave'),
      altText: 'Federal Reserve business team meeting in office',
    };
    const editorial = {
      ...candidate('federal-reserve-chair', 'brave'),
      altText: 'Federal Reserve chair speaking after a policy meeting',
      sourceUrl:
        'https://www.reuters.com/world/us/federal-reserve-policy-meeting/',
    };
    const pexelsSearch = vi.fn().mockResolvedValue([
      {
        ...candidate('stock-traders', 'pexels'),
        altText: 'Financial traders looking at screens',
      },
    ]);
    const braveSearch = vi
      .fn()
      .mockResolvedValue([synthetic, genericStock, editorial]);
    const acquireImage = vi.fn().mockResolvedValue(acquired('editorial'));

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
      dependencies: {
        acquireImage,
        // Deliberately put stock first; resilient mode must reorder providers.
        searchProviders: [
          { origin: 'pexels', search: pexelsSearch },
          braveProvider(braveSearch),
        ],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(pexelsSearch).not.toHaveBeenCalled();
    expect(acquireImage).toHaveBeenCalledOnce();
    expect(acquireImage).toHaveBeenCalledWith(
      editorial.imageUrl,
      expect.any(Object),
    );
    expect(result.assets[0]?.sourcePageUrl).toBe(editorial.sourceUrl);
  });

  it('uses stock search without Brave for generic B-roll', async () => {
    const stock = candidate('data-center', 'pexels');
    const pexelsSearch = vi.fn().mockResolvedValue([stock]);
    const braveSearch = vi
      .fn()
      .mockResolvedValue([candidate('generic-brave', 'brave')]);

    const result = await planVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['AI data center'] }],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('data-center')),
        searchProviders: [
          braveProvider(braveSearch),
          { origin: 'pexels', search: pexelsSearch },
        ],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(pexelsSearch).toHaveBeenCalledOnce();
    expect(braveSearch).not.toHaveBeenCalled();
    expect(result.assets[0]?.provider).toBe('pexels');
  });

  it('never falls back to Brave when every stock provider fails for generic B-roll', async () => {
    const braveSearch = vi
      .fn()
      .mockResolvedValue([candidate('generic-brave', 'brave')]);
    const pexelsSearch = vi.fn().mockRejectedValue(new Error('Pexels offline'));
    const pixabaySearch = vi.fn().mockResolvedValue([]);

    await expect(
      planVisualAssets({
        scenes: [
          { sceneId: 'scene-01', imageSearchIntent: ['AI data center'] },
        ],
        workingDirectory: '/work/visual-assets',
        selectionMode: 'resilient',
        dependencies: {
          acquireImage: vi.fn(),
          searchProviders: [
            braveProvider(braveSearch),
            { origin: 'pexels', search: pexelsSearch },
            { origin: 'pixabay', search: pixabaySearch },
          ],
          fingerprintImage: vi.fn(),
        },
      }),
    ).rejects.toThrow('Pexels offline');

    expect(pexelsSearch).toHaveBeenCalled();
    expect(pixabaySearch).toHaveBeenCalled();
    expect(braveSearch).not.toHaveBeenCalled();
  });

  it('respects provider result ceilings when requesting a large candidate pool', async () => {
    const pexelsSearch = vi
      .fn()
      .mockResolvedValue([candidate('stock', 'pexels')]);

    const result = await planVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['crypto market'] }],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('stock')),
        searchProviders: [
          { origin: 'pexels', maxResults: 80, search: pexelsSearch },
        ],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(pexelsSearch).toHaveBeenCalledWith(
      'crypto market',
      expect.objectContaining({ count: 80 }),
    );
    expect(result.assets[0]?.provider).toBe('pexels');
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

  it('reserves Brave quota for later named scenes even when the first has many intents', async () => {
    const braveSearch = vi.fn().mockResolvedValue([]);
    const pexelsSearch = vi.fn(async (query: string) => [
      candidate(query.replaceAll(' ', '-'), 'pexels'),
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
        acquireImage: vi.fn(async (url: string) =>
          acquired(
            new URL(url).pathname.split('/').at(-1)!.replace('.jpg', ''),
          ),
        ),
        searchProviders: [
          braveProvider(braveSearch),
          { origin: 'pexels', search: pexelsSearch },
        ],
        fingerprintImage: vi
          .fn()
          .mockResolvedValueOnce('0000000000000000')
          .mockResolvedValueOnce('1111111111111111')
          .mockResolvedValueOnce('2222222222222222')
          .mockResolvedValueOnce('3333333333333333'),
      },
    });

    expect(braveSearch.mock.calls.map(([query]) => query)).toEqual([
      'Alpha one',
      'Beta one',
      'Gamma one',
      'Delta one',
    ]);
    expect(result.assets).toHaveLength(4);
  });

  it('caps Brave at four requests per visual plan and falls through to stock', async () => {
    const braveSearch = vi.fn().mockResolvedValue([]);
    const pexelsSearch = vi.fn(async (query: string) => [
      candidate(query.replaceAll(' ', '-'), 'pexels'),
    ]);

    const result = await planVisualAssets({
      scenes: Array.from({ length: 5 }, (_, index) => ({
        sceneId: `scene-0${index + 1}`,
        imageSearchIntent: [`Subject ${index + 1}`],
        imageSearchEntities: [`Subject ${index + 1}`],
      })),
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(async (url: string) =>
          acquired(
            new URL(url).pathname.split('/').at(-1)!.replace('.jpg', ''),
          ),
        ),
        searchProviders: [
          braveProvider(braveSearch),
          { origin: 'pexels', search: pexelsSearch },
        ],
        fingerprintImage: vi
          .fn()
          .mockResolvedValueOnce('0000000000000000')
          .mockResolvedValueOnce('1111111111111111')
          .mockResolvedValueOnce('2222222222222222')
          .mockResolvedValueOnce('3333333333333333')
          .mockResolvedValueOnce('4444444444444444'),
      },
    });

    expect(braveSearch).toHaveBeenCalledTimes(4);
    expect(pexelsSearch).toHaveBeenCalledTimes(5);
    expect(result.assets).toHaveLength(5);
    expect(result.assets.every((asset) => asset.provider === 'pexels')).toBe(
      true,
    );
  });

  it('prefers a non-consecutive reusable image and records provider failures', async () => {
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
        searchProviders: [{ origin: 'pexels', search }],
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

  it('records provider failures and still completes from an existing image', async () => {
    const progress: VisualAssetProgress[] = [];
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error('Pexels search failed: 503'))
      .mockResolvedValueOnce([]);

    const result = await planVisualAssets({
      scenes: twoScenes,
      articleImages: [candidate('article-a')],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      onProgress: (event) => progress.push(event),
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('article-a')),
        searchProviders: [{ origin: 'pexels', search }],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(result.scenes[1]?.assetId).toBe('image-01');
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

  it('reuses an already validated image when an entity scene finds nothing', async () => {
    const pexelsSearch = vi.fn(async (query: string) =>
      query.includes('stablecoin')
        ? [
            {
              ...candidate('stablecoin-desk', 'pexels'),
              altText: 'stablecoin trading desk',
            },
          ]
        : [],
    );
    const braveSearch = vi.fn().mockResolvedValue([]);
    const progress: VisualAssetProgress[] = [];

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
      onProgress: (event) => progress.push(event),
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('stablecoin-desk')),
        searchProviders: [
          braveProvider(braveSearch),
          { origin: 'pexels', search: pexelsSearch },
        ],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    // Under entity anchoring the reuse pool is only images already validated for
    // this episode, so an unfillable scene repeats rather than going off-topic.
    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-01' },
    ]);
    expect(progress).toContainEqual(
      expect.objectContaining({ sceneId: 'scene-02', provider: 'reuse' }),
    );
  });
});
