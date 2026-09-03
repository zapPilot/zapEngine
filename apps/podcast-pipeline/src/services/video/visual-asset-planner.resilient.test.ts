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

  it('tries a broader official-event query on stock before reusing a generic image', async () => {
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

  it('uses Brave directly for named scenes and selects the editorial candidate', async () => {
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
    expect(result.assets[0]?.sourcePageUrl).toBe(editorial.sourceUrl);
    expect(progress).toContainEqual(
      expect.objectContaining({
        phase: 'search',
        provider: 'brave',
        searchIntent: 'Federal Reserve policy meeting photo',
        subjectKey: 'federal reserve',
      }),
    );
  });

  it('does not consume publisher article imagery as the lead named cover', async () => {
    const article = candidate('publisher-cover');
    article.sourceUrl = 'https://publisher.example.test/story';
    const searched = {
      ...candidate('justin-sun-interview', 'pexels'),
      altText: 'Justin Sun interview portrait',
    };
    const search = vi.fn().mockResolvedValue([searched]);
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
        searchProviders: [{ origin: 'pexels', search }],
        fingerprintImage: vi
          .fn()
          .mockResolvedValueOnce('0000000000000000')
          .mockResolvedValueOnce('ffffffffffffffff'),
      },
    });

    expect(result.assets[0]?.provider).toBe('pexels');
    expect(result.assets[1]?.provider).toBe('article');
    expect(result.scenes[0]?.assetId).toBe('image-01');
    expect(result.scenes[1]?.assetId).toBe('image-02');
  });

  it('uses Brave for generic B-roll when it is the configured provider', async () => {
    const braveSearch = vi
      .fn()
      .mockResolvedValue([candidate('generic-brave', 'brave')]);

    const result = await planVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['AI data center'] }],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('generic-brave')),
        searchProviders: [braveProvider(braveSearch)],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(braveSearch).toHaveBeenCalledOnce();
    expect(result.assets[0]?.provider).toBe('brave');
  });

  it('tries the relaxed Brave query when the first generic B-roll query returns nothing', async () => {
    const braveSearch = vi.fn(async (query: string) =>
      query.includes('official event photo')
        ? [candidate('generic-brave', 'brave')]
        : [],
    );

    const result = await planVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['AI data center'] }],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('generic-brave')),
        searchProviders: [braveProvider(braveSearch)],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(braveSearch.mock.calls.map(([query]) => query)).toEqual([
      'AI data center',
      'ai data center official event photo',
    ]);
    expect(result.assets[0]?.provider).toBe('brave');
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

  it('reserves Brave quota for later named scenes when free stock has no entity match', async () => {
    const braveSearch = vi.fn(async (query: string) => [
      {
        ...candidate(query.replaceAll(' ', '-'), 'brave'),
        altText: query,
      },
    ]);
    const pexelsSearch = vi.fn().mockResolvedValue([
      {
        ...candidate('generic-office', 'pexels'),
        altText: 'generic office team',
      },
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
    expect(result.assets.every((asset) => asset.provider === 'brave')).toBe(
      true,
    );
  });

  it('searches Brave for each distinct named scene after the stock-provider retirement', async () => {
    const braveSearch = vi.fn(async (query: string) => [
      {
        ...candidate(`brave-${query.replaceAll(' ', '-')}`, 'brave'),
        altText: query,
      },
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
        searchProviders: [braveProvider(braveSearch)],
        fingerprintImage: vi
          .fn()
          .mockResolvedValueOnce('0000000000000000')
          .mockResolvedValueOnce('1111111111111111')
          .mockResolvedValueOnce('2222222222222222')
          .mockResolvedValueOnce('3333333333333333')
          .mockResolvedValueOnce('4444444444444444'),
      },
    });

    expect(braveSearch).toHaveBeenCalledTimes(5);
    expect(result.assets).toHaveLength(5);
    expect(result.assets.every((asset) => asset.provider === 'brave')).toBe(
      true,
    );
  });

  it('reuses a three-image subject pool instead of searching for endless visual novelty', async () => {
    const progress: VisualAssetProgress[] = [];
    const pexelsSearch = vi.fn().mockResolvedValue([
      {
        ...candidate('justin-sun-a', 'pexels'),
        altText: 'Justin Sun portrait A',
      },
      {
        ...candidate('justin-sun-b', 'pexels'),
        altText: 'Justin Sun portrait B',
      },
      {
        ...candidate('justin-sun-c', 'pexels'),
        altText: 'Justin Sun portrait C',
      },
      {
        ...candidate('justin-sun-d', 'pexels'),
        altText: 'Justin Sun portrait D',
      },
    ]);

    const result = await planVisualAssets({
      scenes: Array.from({ length: 4 }, (_, index) => ({
        sceneId: `scene-0${index + 1}`,
        imageSearchIntent: ['Justin Sun crypto entrepreneur'],
        imageSearchEntities: ['Justin Sun'],
      })),
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      onProgress: (event) => progress.push(event),
      dependencies: {
        acquireImage: vi.fn(async (url: string) =>
          acquired(
            new URL(url).pathname.split('/').at(-1)!.replace('.jpg', ''),
          ),
        ),
        searchProviders: [{ origin: 'pexels', search: pexelsSearch }],
        fingerprintImage: vi
          .fn()
          .mockResolvedValueOnce('0000000000000000')
          .mockResolvedValueOnce('1111111111111111')
          .mockResolvedValueOnce('2222222222222222'),
      },
    });

    expect(pexelsSearch).toHaveBeenCalledOnce();
    expect(result.assets).toHaveLength(3);
    expect(result.scenes[3]?.assetId).toBe('image-01');
    expect(progress).toContainEqual(
      expect.objectContaining({
        phase: 'assets',
        sceneId: 'scene-04',
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

  it('records provider failures and still completes a generic scene from an existing image', async () => {
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

  it('does not reuse an unrelated generic image when a named subject finds nothing', async () => {
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

    await expect(
      planVisualAssets({
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
          searchProviders: [
            braveProvider(braveSearch),
            { origin: 'pexels', search: pexelsSearch },
          ],
          fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
        },
      }),
    ).rejects.toThrow('Visual scene scene-02 has no usable image');
  });
});
