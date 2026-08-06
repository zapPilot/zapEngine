import { describe, expect, it, vi } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import type { AcquiredRemoteImage } from './assets.js';
import type { ImageSearchProvider } from './image-search-provider.js';
import {
  planVisualAssets,
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

function bingProvider(
  search: ImageSearchProvider['search'],
): ImageSearchProvider {
  return { origin: 'bing', search };
}

const twoScenes: VisualAssetScene[] = [
  { sceneId: 'scene-01', imageSearchIntent: ['first subject'] },
  { sceneId: 'scene-02', imageSearchIntent: ['second subject'] },
];

describe('planVisualAssets resilient selection', () => {
  it('records an explicit failure instead of reusing the preceding image', async () => {
    const result = await planVisualAssets({
      scenes: twoScenes,
      articleImages: [candidate('article-a')],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('article-a')),
        searchProviders: [bingProvider(vi.fn().mockResolvedValue([]))],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(result.assets).toHaveLength(1);
    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
    ]);
    expect(result.failures).toEqual([
      { sceneId: 'scene-02', reason: 'no-grounded-photo' },
    ]);
  });

  it('tries a broader official-event query before falling back', async () => {
    const searched = {
      ...candidate('ethereum-validator-conference', 'bing'),
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
        searchProviders: [bingProvider(search)],
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
    expect(result.failures).toEqual([]);
  });

  it('prefers editorial Bing results and drops obvious synthetic artwork', async () => {
    const synthetic = {
      ...candidate('federal-reserve-ai-art', 'bing'),
      altText: 'AI-generated 3D render of a Federal Reserve policy meeting',
    };
    const genericStock = {
      ...candidate('federal-reserve-business-team', 'bing'),
      altText: 'Federal Reserve business team meeting in office',
    };
    const editorial = {
      ...candidate('federal-reserve-chair', 'bing'),
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
    const bingSearch = vi
      .fn()
      .mockResolvedValue([synthetic, genericStock, editorial]);
    const acquireImage = vi.fn().mockResolvedValue(acquired('editorial'));

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['Federal Reserve policy meeting photo'],
        },
      ],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage,
        searchProviders: [
          { origin: 'pexels', search: pexelsSearch },
          bingProvider(bingSearch),
        ],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(pexelsSearch).not.toHaveBeenCalled();
    expect(acquireImage).toHaveBeenCalledWith(
      editorial.imageUrl,
      expect.any(Object),
    );
    expect(result.assets[0]?.sourcePageUrl).toBe(editorial.sourceUrl);
  });

  it('turns provider failure into a modality failure without image reuse', async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error('Bing Images search failed: 503'))
      .mockResolvedValueOnce([]);

    const result = await planVisualAssets({
      scenes: twoScenes,
      articleImages: [candidate('article-a')],
      workingDirectory: '/work/visual-assets',
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('article-a')),
        searchProviders: [bingProvider(search)],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(result.scenes).toHaveLength(1);
    expect(result.failures).toEqual([
      { sceneId: 'scene-02', reason: 'no-grounded-photo' },
    ]);
  });
});
