import { describe, expect, it, vi } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import type { AcquiredRemoteImage } from './assets.js';
import type { ImageSearchProvider } from './image-search-provider.js';
import {
  perceptualHashDistance,
  planVisualAssets,
  type VisualAssetScene,
} from './visual-asset-planner.js';

function bingProviders(
  search: ImageSearchProvider['search'],
): ImageSearchProvider[] {
  return [{ origin: 'bing', search }];
}

const scenes: VisualAssetScene[] = [
  { sceneId: 'scene-01', imageSearchIntent: ['first subject'] },
  { sceneId: 'scene-02', imageSearchIntent: ['second subject'] },
  { sceneId: 'scene-03', imageSearchIntent: ['third subject'] },
];

function candidate(
  id: string,
  origin: ImageCandidate['origin'] = 'article',
): ImageCandidate {
  return {
    imageUrl: `https://images.example.test/${id}.jpg`,
    sourceUrl: `https://publisher.example.test/${id}`,
    origin,
    width: 1600,
    height: 900,
  };
}

function acquired(id: string): AcquiredRemoteImage {
  return {
    path: `/work/${id}.image`,
    contentType: 'image/jpeg',
    sha256: id.padEnd(64, 'a').slice(0, 64),
    width: 1600,
    height: 900,
  };
}

describe('planVisualAssets', () => {
  it('uses qualified article images before invoking Bing search', async () => {
    const acquireImage = vi.fn(async (url: string) =>
      acquired(new URL(url).pathname.split('/').at(-1)!.replace('.jpg', '')),
    );
    const searchImages = vi.fn();

    const result = await planVisualAssets({
      scenes: scenes.slice(0, 2),
      articleImages: [candidate('article-a'), candidate('article-b')],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: bingProviders(searchImages),
        fingerprintImage: vi
          .fn()
          .mockResolvedValueOnce('0000000000000000')
          .mockResolvedValueOnce('ffffffffffffffff'),
      },
    });

    expect(searchImages).not.toHaveBeenCalled();
    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-02' },
    ]);
    expect(result.assets.map((asset) => asset.provider)).toEqual([
      'article',
      'article',
    ]);
  });

  it('excludes thumbnail-like article URLs before downloading candidates', async () => {
    const thumbnail = {
      ...candidate('story-thumbnail'),
      imageUrl: 'https://images.example.test/thumbnail/story.jpg',
    };
    const fullSize = candidate('story-full');
    const acquireImage = vi.fn(async () => acquired('story-full'));

    const result = await planVisualAssets({
      scenes: scenes.slice(0, 1),
      articleImages: [thumbnail, fullSize],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: bingProviders(vi.fn()),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(acquireImage).toHaveBeenCalledOnce();
    expect(acquireImage).toHaveBeenCalledWith(
      fullSize.imageUrl,
      expect.any(Object),
    );
    expect(result.assets[0]?.originalImageUrl).toBe(fullSize.imageUrl);
  });

  it('skips text-heavy Bing cards before downloading photographic results', async () => {
    const infographic = {
      ...candidate('types-of-ai-agents', 'bing'),
      altText: 'Types of AI Agents Explained with Simple Examples',
    };
    const presentation = {
      ...candidate('stablecoin-presentation', 'bing'),
      imageUrl:
        'https://images.example.test/stablecoin-presentation-slide01.jpg',
    };
    const comparisonCover = {
      ...candidate('founder-comparison', 'bing'),
      altText: 'Musk vs. Kurzweil: a technology comparison',
    };
    const watermarkedStock = {
      ...candidate('business-handshake', 'bing'),
      sourceUrl: 'https://www.dreamstime.com/business-handshake-photo',
    };
    const vecteezyPreview = {
      ...candidate('ai-engineers', 'bing'),
      sourceUrl: 'https://www.vecteezy.com/photo/12345-ai-engineers',
    };
    const publisherTextCard = {
      ...candidate('blockchain-in-real-estate', 'bing'),
      sourceUrl:
        'https://www.uniondevelopers.com/blog/blockchain-in-real-estate/',
    };
    const brandedArticleCover = {
      ...candidate('tokenized-real-world-assets', 'bing'),
      sourceUrl:
        'https://blog.chainport.io/blockchain-tokenizing-real-world-assets-rwa',
    };
    const photograph = {
      ...candidate('robot-laboratory', 'bing'),
      altText: 'Humanoid robot working in a laboratory',
    };
    const acquireImage = vi
      .fn()
      .mockResolvedValue(acquired('robot-laboratory'));

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['humanoid robot laboratory photo'],
        },
      ],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: bingProviders(
          vi
            .fn()
            .mockResolvedValue([
              infographic,
              presentation,
              comparisonCover,
              watermarkedStock,
              vecteezyPreview,
              publisherTextCard,
              brandedArticleCover,
              photograph,
            ]),
        ),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(acquireImage).toHaveBeenCalledOnce();
    expect(acquireImage).toHaveBeenCalledWith(
      photograph.imageUrl,
      expect.any(Object),
    );
    expect(result.assets[0]?.originalImageUrl).toBe(photograph.imageUrl);
  });

  it('uses Bing after article images and only reuses non-consecutively', async () => {
    const article = candidate('article-a');
    const searched = {
      ...candidate('search-b', 'bing'),
      altText: 'second subject',
    };
    const acquireImage = vi.fn(async (url: string) =>
      url === article.imageUrl ? acquired('article-a') : acquired('search-b'),
    );
    const searchImages = vi
      .fn()
      .mockResolvedValueOnce([searched])
      .mockResolvedValueOnce([]);
    const progress = vi.fn();

    const result = await planVisualAssets({
      scenes,
      articleImages: [article],
      workingDirectory: '/work/visual-assets',
      onProgress: progress,
      dependencies: {
        acquireImage,
        searchProviders: bingProviders(searchImages),
        fingerprintImage: vi
          .fn()
          .mockResolvedValueOnce('0000000000000000')
          .mockResolvedValueOnce('ffffffffffffffff'),
      },
    });

    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-02' },
      { sceneId: 'scene-03', assetId: 'image-01' },
    ]);
    expect(result.assets).toHaveLength(2);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'assets',
        sceneId: 'scene-03',
        provider: 'reuse',
      }),
    );
  });

  it('continues to the next search intent after a zero-result query', async () => {
    const searched = {
      ...candidate('search-result', 'bing'),
      altText: 'broader subject',
    };
    const searchImages = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([searched]);

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['too narrow', 'broader subject'],
        },
      ],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('search-result')),
        searchProviders: bingProviders(searchImages),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(searchImages).toHaveBeenCalledTimes(2);
    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
    ]);
  });

  it('ranks a semantically related photo ahead of an unrelated child image', async () => {
    const unrelated = {
      ...candidate('children-school', 'bing'),
      altText: 'Children arriving at school',
    };
    const related = {
      ...candidate('ai-data-center', 'bing'),
      altText: 'AI engineers monitoring data center servers',
    };
    const acquireImage = vi.fn().mockResolvedValue(acquired('ai-data-center'));

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: [
            'AI engineers monitoring data center servers photo',
          ],
        },
      ],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: bingProviders(
          vi.fn().mockResolvedValue([unrelated, related]),
        ),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(acquireImage).toHaveBeenCalledOnce();
    expect(acquireImage).toHaveBeenCalledWith(
      related.imageUrl,
      expect.any(Object),
    );
    expect(result.assets[0]?.originalImageUrl).toBe(related.imageUrl);
  });

  it('rejects a high-resolution result with no topical token overlap', async () => {
    const unrelated = {
      ...candidate('award-winning-photojournalism', 'bing'),
      altText: 'Award-winning documentary portrait from a global news story',
      width: 4000,
      height: 2250,
    };
    const related = {
      ...candidate('blockchain-engineers', 'bing'),
      altText: 'Blockchain engineers collaborating in an office',
    };
    const acquireImage = vi
      .fn()
      .mockResolvedValue(acquired('blockchain-engineers'));

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['blockchain engineers office photo'],
        },
      ],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: bingProviders(
          vi.fn().mockResolvedValue([unrelated, related]),
        ),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(acquireImage).toHaveBeenCalledOnce();
    expect(acquireImage).toHaveBeenCalledWith(
      related.imageUrl,
      expect.any(Object),
    );
    expect(result.assets[0]?.originalImageUrl).toBe(related.imageUrl);
  });

  it('rejects opaque CDN images whose source page is a slide provider', async () => {
    const slide = {
      ...candidate('opaque-cdn-id', 'bing'),
      sourceUrl: 'https://www.slideshare.net/example/opaque-deck',
      altText: 'Secure digital identity',
    };
    const photograph = {
      ...candidate('security-team', 'bing'),
      altText: 'Cybersecurity team working in an office',
    };
    const acquireImage = vi.fn().mockResolvedValue(acquired('security-team'));

    await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['cybersecurity team office photo'],
        },
      ],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: bingProviders(
          vi.fn().mockResolvedValue([slide, photograph]),
        ),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(acquireImage).toHaveBeenCalledOnce();
    expect(acquireImage).toHaveBeenCalledWith(
      photograph.imageUrl,
      expect.any(Object),
    );
  });

  it('continues after candidate exhaustion and acquires from a later intent', async () => {
    const rejected = {
      ...candidate('rejected', 'bing'),
      altText: 'first subject',
    };
    const usable = {
      ...candidate('usable', 'bing'),
      altText: 'second subject',
    };
    const acquireImage = vi
      .fn()
      .mockRejectedValueOnce(new Error('image dimensions too small'))
      .mockResolvedValueOnce(acquired('usable'));

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['first subject', 'second subject'],
        },
      ],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: bingProviders(
          vi
            .fn()
            .mockResolvedValueOnce([rejected])
            .mockResolvedValueOnce([usable]),
        ),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(acquireImage).toHaveBeenCalledTimes(2);
    expect(result.assets[0]?.originalImageUrl).toBe(usable.imageUrl);
  });

  it('reports safe aggregate causes when every candidate is rejected', async () => {
    const progress = vi.fn();
    const searched = [
      candidate('forbidden', 'bing'),
      candidate('too-short-a', 'bing'),
      candidate('too-short-b', 'bing'),
      candidate('transport', 'bing'),
    ].map((image) => ({ ...image, altText: 'first subject' }));
    const result = planVisualAssets({
      scenes: scenes.slice(0, 1),
      workingDirectory: '/work/visual-assets',
      onProgress: progress,
      dependencies: {
        acquireImage: vi
          .fn()
          .mockRejectedValueOnce(
            new Error('Image request failed with HTTP 403'),
          )
          .mockRejectedValueOnce(
            new Error(
              'fullBleed image long edge is 1300px; 1600px is required',
            ),
          )
          .mockRejectedValueOnce(
            new Error('fullBleed image short edge is 800px; 900px is required'),
          )
          .mockRejectedValueOnce(
            new Error(
              'fetch https://media.example.test/image?token=secret failed',
            ),
          ),
        searchProviders: bingProviders(vi.fn().mockResolvedValue(searched)),
        fingerprintImage: vi.fn(),
      },
    });

    await expect(result).rejects.toThrow(
      'Visual scene scene-01 has no usable image after rejecting 4 candidate(s) (dimensions-too-small:2,http-403:1,other:1)',
    );
    await expect(result).rejects.not.toThrow(/media\.example|token|secret/i);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'search',
        candidateCount: 4,
        rejectedCandidateCount: 4,
        rejectionSummary: 'dimensions-too-small:2,http-403:1,other:1',
      }),
    );
  });

  it('propagates worker cancellation without converting it to a rejection', async () => {
    const controller = new AbortController();
    const leaseError = new Error('visual lease lost');
    const acquireImage = vi.fn(async () => {
      controller.abort(leaseError);
      throw leaseError;
    });

    await expect(
      planVisualAssets({
        scenes: scenes.slice(0, 1),
        articleImages: [candidate('article-a')],
        workingDirectory: '/work/visual-assets',
        signal: controller.signal,
        dependencies: {
          acquireImage,
          searchProviders: bingProviders(vi.fn()),
          fingerprintImage: vi.fn(),
        },
      }),
    ).rejects.toBe(leaseError);
  });

  it('uses a non-consecutive image when every query has zero results', async () => {
    const searchImages = vi.fn().mockResolvedValue([]);

    const result = await planVisualAssets({
      scenes,
      articleImages: [candidate('article-a'), candidate('article-b')],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage: vi
          .fn()
          .mockResolvedValueOnce(acquired('article-a'))
          .mockResolvedValueOnce(acquired('article-b')),
        searchProviders: bingProviders(searchImages),
        fingerprintImage: vi
          .fn()
          .mockResolvedValueOnce('0000000000000000')
          .mockResolvedValueOnce('ffffffffffffffff'),
      },
    });

    expect(result.scenes.at(-1)).toEqual({
      sceneId: 'scene-03',
      assetId: 'image-01',
    });
    expect(searchImages).toHaveBeenCalledOnce();
  });

  it('does not hide a provider failure behind reusable article assets', async () => {
    const searchImages = vi
      .fn()
      .mockRejectedValue(new Error('Bing Images search failed: 503'));

    await expect(
      planVisualAssets({
        scenes,
        articleImages: [candidate('article-a'), candidate('article-b')],
        workingDirectory: '/work/visual-assets',
        dependencies: {
          acquireImage: vi
            .fn()
            .mockResolvedValueOnce(acquired('article-a'))
            .mockResolvedValueOnce(acquired('article-b')),
          searchProviders: bingProviders(searchImages),
          fingerprintImage: vi
            .fn()
            .mockResolvedValueOnce('0000000000000000')
            .mockResolvedValueOnce('ffffffffffffffff'),
        },
      }),
    ).rejects.toThrow(
      'Visual image search failed for scene scene-03: Bing Images search failed: 503',
    );
  });

  it('surfaces provider or markup failures when no usable path exists', async () => {
    const searchImages = vi
      .fn()
      .mockRejectedValueOnce(new Error('Bing Images search failed: 503'))
      .mockRejectedValueOnce(
        new Error('Bing Images search returned no parseable image results'),
      );

    await expect(
      planVisualAssets({
        scenes: [
          {
            sceneId: 'scene-01',
            imageSearchIntent: ['first subject', 'second subject'],
          },
        ],
        workingDirectory: '/work/visual-assets',
        dependencies: {
          acquireImage: vi.fn(),
          searchProviders: bingProviders(searchImages),
          fingerprintImage: vi.fn(),
        },
      }),
    ).rejects.toThrow(
      'Visual image search failed for scene scene-01: Bing Images search failed: 503; Bing Images search returned no parseable image results',
    );
    expect(searchImages).toHaveBeenCalledTimes(2);
  });

  it('rejects a consecutive reuse when no second image can be acquired', async () => {
    await expect(
      planVisualAssets({
        scenes: scenes.slice(0, 2),
        articleImages: [candidate('article-a')],
        workingDirectory: '/work/visual-assets',
        dependencies: {
          acquireImage: vi.fn().mockResolvedValue(acquired('article-a')),
          searchProviders: bingProviders(vi.fn().mockResolvedValue([])),
          fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
        },
      }),
    ).rejects.toThrow(
      'Visual scene scene-02 cannot reuse the immediately preceding image',
    );
  });

  it('prefers license-clean providers and records photographer provenance', async () => {
    const pexelsCandidate: ImageCandidate = {
      imageUrl: 'https://images.pexels.example.test/world-cup.jpeg',
      sourceUrl: 'https://www.pexels.com/photo/world-cup-12345/',
      origin: 'pexels',
      width: 1_600,
      height: 1_200,
      altText: 'stadium crowd',
      photographer: 'Jane Doe',
      photographerUrl: 'https://www.pexels.com/@jane-doe/',
    };
    const pexelsSearch = vi.fn().mockResolvedValue([pexelsCandidate]);
    const pixabaySearch = vi.fn();
    const bingSearch = vi.fn();

    const result = await planVisualAssets({
      scenes: scenes.slice(0, 1),
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('world-cup')),
        searchProviders: [
          { origin: 'pexels', search: pexelsSearch },
          { origin: 'pixabay', search: pixabaySearch },
          { origin: 'bing', search: bingSearch },
        ],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(pixabaySearch).not.toHaveBeenCalled();
    expect(bingSearch).not.toHaveBeenCalled();
    expect(result.assets[0]).toMatchObject({
      provider: 'pexels',
      license: 'pexels',
      photographer: 'Jane Doe',
      photographerUrl: 'https://www.pexels.com/@jane-doe/',
    });
  });

  it('falls through to the next provider when a clean provider errors', async () => {
    const pexelsSearch = vi
      .fn()
      .mockRejectedValue(new Error('Pexels search failed: 429'));
    const bingCandidate = {
      ...candidate('fallback', 'bing'),
      altText: 'first subject',
    };
    const bingSearch = vi.fn().mockResolvedValue([bingCandidate]);

    const result = await planVisualAssets({
      scenes: scenes.slice(0, 1),
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('fallback')),
        searchProviders: [
          { origin: 'pexels', search: pexelsSearch },
          { origin: 'bing', search: bingSearch },
        ],
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(pexelsSearch).toHaveBeenCalledOnce();
    expect(result.assets[0]?.provider).toBe('bing');
    expect(result.assets[0]?.license).toBe('unknown');
  });

  it('fails explicitly instead of producing an asset-none or text fallback', async () => {
    await expect(
      planVisualAssets({
        scenes: scenes.slice(0, 1),
        articleImages: [],
        workingDirectory: '/work/visual-assets',
        dependencies: {
          acquireImage: vi.fn(),
          searchProviders: bingProviders(vi.fn().mockResolvedValue([])),
          fingerprintImage: vi.fn(),
        },
      }),
    ).rejects.toThrow('Visual scene scene-01 has no usable image');
  });
});

describe('perceptualHashDistance', () => {
  it('counts changed bits and rejects malformed hashes', () => {
    expect(perceptualHashDistance('0000000000000000', '000000000000000f')).toBe(
      4,
    );
    expect(() => perceptualHashDistance('short', '0000000000000000')).toThrow(
      '64-bit hexadecimal',
    );
  });
});
