import { describe, expect, it, type Mock, vi } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import type { AcquiredRemoteImage } from './assets.js';
import type { ImageSearchProvider } from './image-search-provider.js';
import { mentionsAnyEntity } from './search-candidate-ranking.js';
import {
  perceptualHashDistance,
  planVisualAssets,
  type VisualAssetProgress,
  type VisualAssetScene,
} from './visual-asset-planner.js';

function braveProviders(
  search: ImageSearchProvider['search'],
): ImageSearchProvider[] {
  return [{ origin: 'brave', search }];
}

/**
 * Each subject is asked exactly once, so a fixture can no longer answer by call
 * order: the query is the only thing that says which subject is being searched.
 */
function searchByQuery(
  answers: Readonly<Record<string, ImageCandidate[]>>,
): Mock<ImageSearchProvider['search']> {
  return vi.fn(async (query: string) => answers[query] ?? []);
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
  it('rejects an empty scene list', async () => {
    await expect(
      planVisualAssets({
        scenes: [],
        workingDirectory: '/work/visual-assets',
        dependencies: {
          acquireImage: vi.fn(),
          searchProviders: [],
          fingerprintImage: vi.fn(),
        },
      }),
    ).rejects.toThrow('requires at least one scene');
  });

  it('uses qualified article images before invoking Brave search', async () => {
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
        searchProviders: braveProviders(searchImages),
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

  it('keeps the lead scene off the publisher image the pool also returned', async () => {
    // The cover is independently sourced from the headline subject, so the
    // article's own photograph must not reach scene-01 through Brave either.
    const publisherPhoto = {
      ...candidate('publisher-hero', 'brave'),
      sourceUrl: 'https://publisher.example.test/story',
      altText: 'Coldcard hardware wallet on a desk',
    };
    const independent = {
      ...candidate('independent-hero', 'brave'),
      altText: 'Coldcard air-gapped device',
    };
    const acquireImage = vi.fn().mockResolvedValue(acquired('independent'));

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['Coldcard hardware wallet on a desk'],
          imageSearchEntities: ['Coldcard'],
        },
      ],
      articleImages: [
        {
          ...candidate('article-hero'),
          sourceUrl: 'https://publisher.example.test/story',
        },
      ],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(
          searchByQuery({
            'Coldcard hardware wallet on a desk': [publisherPhoto, independent],
          }),
        ),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(acquireImage.mock.calls.map(([url]) => url)).toEqual([
      independent.imageUrl,
    ]);
    expect(result.assets[0]?.originalImageUrl).toBe(independent.imageUrl);
  });

  it('continues after rejected article candidates and deduplicates canonical URLs', async () => {
    const first = {
      ...candidate('same-a'),
      imageUrl: 'https://images.example.test/same.jpg#first',
    };
    const duplicate = {
      ...candidate('same-b'),
      imageUrl: 'https://images.example.test/same.jpg#second',
    };
    const usable = candidate('usable-article');
    const acquireImage = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary decode failure'))
      .mockResolvedValueOnce(acquired('usable-article'));

    const result = await planVisualAssets({
      scenes: scenes.slice(0, 1),
      articleImages: [first, duplicate, usable],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(vi.fn()),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(acquireImage).toHaveBeenCalledTimes(2);
    expect(result.assets[0]?.originalImageUrl).toBe(usable.imageUrl);
  });

  it('rejects invalid and cross-provider duplicate URLs before acquiring a fallback', async () => {
    const repeated = { ...candidate('repeated'), altText: 'first subject' };
    const fallback = {
      ...candidate('fallback', 'brave'),
      altText: 'first subject',
    };
    const acquireImage = vi
      .fn()
      .mockRejectedValueOnce(new Error('article decode failed'))
      .mockResolvedValueOnce(acquired('fallback'));
    const search = vi.fn().mockResolvedValue([
      {
        ...candidate('invalid', 'brave'),
        imageUrl: 'javascript:alert(1)',
        altText: 'first subject',
      },
      { ...repeated, origin: 'brave' as const },
      fallback,
    ]);

    const result = await planVisualAssets({
      scenes: scenes.slice(0, 1),
      articleImages: [repeated],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(acquireImage).toHaveBeenCalledTimes(2);
    expect(result.assets[0]?.originalImageUrl).toBe(fallback.imageUrl);
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
        searchProviders: braveProviders(vi.fn()),
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

  it('skips text-heavy Brave cards before downloading photographic results', async () => {
    const infographic = {
      ...candidate('types-of-ai-agents', 'brave'),
      altText: 'Types of AI Agents Explained with Simple Examples',
    };
    const presentation = {
      ...candidate('stablecoin-presentation', 'brave'),
      imageUrl:
        'https://images.example.test/stablecoin-presentation-slide01.jpg',
    };
    const comparisonCover = {
      ...candidate('founder-comparison', 'brave'),
      altText: 'Musk vs. Kurzweil: a technology comparison',
    };
    const watermarkedStock = {
      ...candidate('business-handshake', 'brave'),
      sourceUrl: 'https://www.dreamstime.com/business-handshake-photo',
    };
    const vecteezyPreview = {
      ...candidate('ai-engineers', 'brave'),
      sourceUrl: 'https://www.vecteezy.com/photo/12345-ai-engineers',
    };
    const publisherTextCard = {
      ...candidate('blockchain-in-real-estate', 'brave'),
      sourceUrl:
        'https://www.uniondevelopers.com/blog/blockchain-in-real-estate/',
    };
    const brandedArticleCover = {
      ...candidate('tokenized-real-world-assets', 'brave'),
      sourceUrl:
        'https://blog.chainport.io/blockchain-tokenizing-real-world-assets-rwa',
    };
    const photograph = {
      ...candidate('robot-laboratory', 'brave'),
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
        searchProviders: braveProviders(
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

  it('uses Brave after article images and only reuses non-consecutively', async () => {
    const article = candidate('article-a');
    const searched = {
      ...candidate('search-b', 'brave'),
      altText: 'second subject',
    };
    const acquireImage = vi.fn(async (url: string) =>
      url === article.imageUrl ? acquired('article-a') : acquired('search-b'),
    );
    const searchImages = searchByQuery({ 'second subject': [searched] });
    const progress = vi.fn();

    const result = await planVisualAssets({
      scenes,
      articleImages: [article],
      workingDirectory: '/work/visual-assets',
      onProgress: progress,
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(searchImages),
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

  it('does not buy a second request for a subject whose query returned nothing', async () => {
    // A widened retry of the same subject is what the per-scene intent loop
    // used to spend requests on. One query per subject is the budget model, so
    // an empty answer degrades the scene to reuse instead of being re-asked.
    const searchImages = searchByQuery({});

    const result = await planVisualAssets({
      scenes: [
        scenes[0]!,
        {
          sceneId: 'scene-02',
          imageSearchIntent: ['too narrow', 'broader subject'],
        },
      ],
      articleImages: [candidate('article-a')],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('article-a')),
        searchProviders: braveProviders(searchImages),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(searchImages.mock.calls.map(([query]) => query)).toEqual([
      'too narrow',
    ]);
    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-01' },
    ]);
  });

  it('ranks a semantically related photo ahead of an unrelated child image', async () => {
    const unrelated = {
      ...candidate('children-school', 'brave'),
      altText: 'Children arriving at school',
    };
    const related = {
      ...candidate('ai-data-center', 'brave'),
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
        searchProviders: braveProviders(
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
      ...candidate('award-winning-photojournalism', 'brave'),
      altText: 'Award-winning documentary portrait from a global news story',
      width: 4000,
      height: 2250,
    };
    const related = {
      ...candidate('blockchain-engineers', 'brave'),
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
        searchProviders: braveProviders(
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

  it('ranks a candidate that names the subject first and uses one that does not', async () => {
    // The hard gate this replaced discarded every viable candidate an episode
    // had before a single download, because a news photograph rarely repeats
    // its subject's name in alt text. The unnamed candidate here outscores the
    // named one on every other signal -- it echoes the whole query and is the
    // larger image -- so the mention bonus is the only thing that can rank the
    // named one first, and the second scene proves the other is still used.
    const unrelated = {
      ...candidate('italian-greyhound-colors', 'brave'),
      altText: 'Hardware wallet on a desk, Italian greyhound in the background',
      width: 4000,
      height: 2250,
    };
    const named = {
      ...candidate('coldcard-signing-device', 'brave'),
      altText: 'Coldcard air-gapped signing device',
    };
    const acquireImage = vi.fn(async (url: string) =>
      acquired(new URL(url).pathname.split('/').at(-1)!.replace('.jpg', '')),
    );
    const subject = {
      imageSearchIntent: ['Coldcard hardware wallet on a desk'],
      imageSearchEntities: ['Coldcard'],
    };

    const result = await planVisualAssets({
      scenes: [
        { sceneId: 'scene-01', ...subject },
        { sceneId: 'scene-02', ...subject },
      ],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(
          searchByQuery({
            'Coldcard hardware wallet on a desk': [unrelated, named],
          }),
        ),
        fingerprintImage: vi
          .fn()
          .mockResolvedValueOnce('0000000000000000')
          .mockResolvedValueOnce('ffffffffffffffff'),
      },
    });

    expect(acquireImage.mock.calls.map(([url]) => url)).toEqual([
      named.imageUrl,
      unrelated.imageUrl,
    ]);
    expect(result.assets.map((asset) => asset.originalImageUrl)).toEqual([
      named.imageUrl,
      unrelated.imageUrl,
    ]);
  });

  it('accepts a named subject however the page spells it', async () => {
    const related = {
      ...candidate('coldcard-mk4-review', 'brave'),
      altText: 'Hardware wallet on a desk',
      photographer: 'Jane Doe',
      photographerUrl: 'https://photos.example.test/@jane-doe',
    };
    const acquireImage = vi
      .fn()
      .mockResolvedValue(acquired('coldcard-mk4-review'));

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['Coldcard hardware wallet on a desk'],
          imageSearchEntities: ['Coldcard Mk4'],
        },
      ],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(vi.fn().mockResolvedValue([related])),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(result.assets[0]).toMatchObject({
      originalImageUrl: related.imageUrl,
      provider: 'brave',
      license: 'unknown',
      photographer: 'Jane Doe',
      photographerUrl: 'https://photos.example.test/@jane-doe',
    });
  });

  it('keeps every candidate for a scene that names nothing', async () => {
    const generic = {
      ...candidate('shipping-containers', 'brave'),
      altText: 'Shipping containers stacked at a port',
    };
    const acquireImage = vi
      .fn()
      .mockResolvedValue(acquired('shipping-containers'));

    const result = await planVisualAssets({
      scenes: [
        { sceneId: 'scene-01', imageSearchIntent: ['cargo port at sunrise'] },
      ],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(vi.fn().mockResolvedValue([generic])),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(result.assets[0]?.originalImageUrl).toBe(generic.imageUrl);
  });

  it('rejects opaque CDN images whose source page is a slide provider', async () => {
    const slide = {
      ...candidate('opaque-cdn-id', 'brave'),
      sourceUrl: 'https://www.slideshare.net/example/opaque-deck',
      altText: 'Secure digital identity',
    };
    const photograph = {
      ...candidate('security-team', 'brave'),
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
        searchProviders: braveProviders(
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

  it('takes the next entry of the same result set after one fails to acquire', async () => {
    const rejected = {
      ...candidate('rejected', 'brave'),
      altText: 'first subject',
    };
    const usable = {
      ...candidate('usable', 'brave'),
      altText: 'second subject',
    };
    const searchImages = searchByQuery({
      'first subject': [rejected, usable],
    });
    const acquireImage = vi
      .fn()
      .mockRejectedValueOnce(new Error('image dimensions too small'))
      .mockResolvedValueOnce(acquired('usable'));

    const result = await planVisualAssets({
      scenes: scenes.slice(0, 1),
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(searchImages),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(searchImages).toHaveBeenCalledOnce();
    expect(acquireImage).toHaveBeenCalledTimes(2);
    expect(result.assets[0]?.originalImageUrl).toBe(usable.imageUrl);
  });

  it('classifies acquisition failures without leaking candidate details', async () => {
    const searched = [
      'timeout',
      'format',
      'animated',
      'size',
      'safety',
      'redirect',
      'dns',
      'network',
      'decode',
      'empty',
    ].map((id) => ({
      ...candidate(id, 'brave'),
      altText: 'target subject',
    }));
    const acquireImage = vi
      .fn()
      .mockRejectedValueOnce(new Error('Image download timed out'))
      .mockRejectedValueOnce(new Error('unsupported raster content type'))
      .mockRejectedValueOnce(new Error('animated image is not supported'))
      .mockRejectedValueOnce(
        new Error('Image exceeds the 25 MiB download limit'),
      )
      .mockRejectedValueOnce(new Error('private or reserved IP'))
      .mockRejectedValueOnce(new Error('redirect limit exceeded'))
      .mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND images.test'))
      .mockRejectedValueOnce(new Error('ECONNRESET network failure'))
      .mockRejectedValueOnce(new Error('corrupt image decode failed'))
      .mockResolvedValueOnce(null);
    const progress: VisualAssetProgress[] = [];

    const failure = await planVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['target subject'] }],
      workingDirectory: '/work/visual-assets',
      onProgress: (event) => progress.push(event),
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(vi.fn().mockResolvedValue(searched)),
        fingerprintImage: vi.fn(),
      },
    }).catch((error: unknown) => error);

    const allCauses =
      'animated-image:1,decode:1,dns:1,empty-acquisition:1,network:1,redirect:1,safety-policy:1,size-limit:1,timeout:1,unsupported-format:1';
    expect(
      progress.find((event) => event.phase === 'exhausted')?.rejectionSummary,
    ).toBe(allCauses);
    expect(failure).toMatchObject({
      rejections: {
        'animated-image': 1,
        decode: 1,
        dns: 1,
        'empty-acquisition': 1,
        network: 1,
        redirect: 1,
        'safety-policy': 1,
        'size-limit': 1,
        timeout: 1,
        'unsupported-format': 1,
      },
    });
    // The message is the Telegram-bound channel, so it lists as many causes as
    // it can afford and says how many it dropped rather than pushing the pool
    // counts off the end of the line.
    expect((failure as Error).message).toContain(
      'after rejecting 10 candidate(s) (animated-image:1,decode:1,dns:1,empty-acquisition:1,+6 more)',
    );
    expect((failure as Error).message).not.toMatch(
      /ECONNRESET|ENOTFOUND|images\.test|25 MiB/u,
    );
  });

  it('rejects exact and perceptual duplicate images before selecting a unique candidate', async () => {
    const article = candidate('article-a');
    const searched = ['same-sha', 'same-phash', 'unique'].map((id) => ({
      ...candidate(id, 'brave'),
      altText: 'second subject',
    }));
    const articleAsset = acquired('article-a');
    const sameSha = { ...acquired('same-sha'), sha256: articleAsset.sha256 };
    const samePhash = acquired('same-phash');
    const unique = acquired('unique');
    const acquireImage = vi
      .fn()
      .mockResolvedValueOnce(articleAsset)
      .mockResolvedValueOnce(sameSha)
      .mockResolvedValueOnce(samePhash)
      .mockResolvedValueOnce(unique);
    const fingerprintImage = vi
      .fn()
      .mockResolvedValueOnce('0000000000000000')
      .mockResolvedValueOnce('ffffffffffffffff')
      .mockResolvedValueOnce('0000000000000001')
      .mockResolvedValueOnce('ffffffffffffffff');

    const result = await planVisualAssets({
      scenes: scenes.slice(0, 2),
      articleImages: [article],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(vi.fn().mockResolvedValue(searched)),
        fingerprintImage,
      },
    });

    expect(result.assets).toHaveLength(2);
    expect(result.assets[1]?.originalImageUrl).toBe(searched[2]?.imageUrl);
    expect(acquireImage).toHaveBeenCalledTimes(4);
  });

  it('exercises ranking branches for formats, dimensions, intent exceptions, penalties, and malformed percent encoding', async () => {
    const rankedCandidates: ImageCandidate[] = [
      {
        ...candidate('education-children', 'brave'),
        imageUrl: 'https://images.example.test/education-children.webp',
        altText: 'children classroom education target 2026',
        width: 1000,
        height: 1000,
      },
      {
        ...candidate('history-archive', 'brave'),
        imageUrl: 'https://images.example.test/history-archive.png',
        altText: 'historical archive target 2026',
        width: 1800,
        height: 1000,
      },
      {
        ...candidate('portrait', 'brave'),
        imageUrl: 'https://images.example.test/portrait',
        altText: 'target 2026 portrait',
        width: 600,
        height: 1000,
      },
      {
        ...candidate('no-dimensions', 'brave'),
        altText: 'target 2026 no dimensions',
        width: undefined,
        height: undefined,
      },
      {
        ...candidate('children-penalty', 'brave'),
        altText: 'target 2026 children classroom',
      },
      {
        ...candidate('history-penalty', 'brave'),
        altText: 'target 2026 vintage historical archive',
      },
      {
        ...candidate('cover-penalty', 'brave'),
        altText: 'target 2026 explained versus comparison',
      },
      {
        ...candidate('source-penalty', 'brave'),
        altText: 'target 2026 source',
        sourceUrl: 'https://medium.com/target/story',
      },
      {
        ...candidate('stock-penalty', 'brave'),
        altText: 'target 2026 business team handshake',
      },
      {
        ...candidate('encoded', 'brave'),
        imageUrl: 'https://images.example.test/target%zz.jpg',
        sourceUrl: 'https://reuters.com/target%zz/story',
        altText: 'target 2026 official event',
        width: 2200,
        height: 1400,
      },
    ];
    const acquireImage = vi.fn().mockResolvedValue(acquired('ranked'));

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: ['education history target 2026'],
        },
      ],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(
          vi.fn().mockResolvedValue(rankedCandidates),
        ),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(result.assets).toHaveLength(1);
    expect(acquireImage).toHaveBeenCalledOnce();
  });

  it('penalizes education and historical imagery when the intent does not ask for it', async () => {
    const search = vi.fn().mockResolvedValue([
      {
        ...candidate('children', 'brave'),
        altText: 'children classroom education target',
      },
      {
        ...candidate('archive', 'brave'),
        altText: 'historical archive vintage target',
      },
      {
        ...candidate('neutral', 'brave'),
        altText: 'target official event',
        sourceUrl: 'not a url',
      },
    ]);

    const progress: VisualAssetProgress[] = [];
    const result = await planVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['target event'] }],
      workingDirectory: '/work/visual-assets',
      onProgress: (event) => progress.push(event),
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('neutral')),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(result.assets).toHaveLength(1);
    const assetsEvent = progress.find((event) => event.phase === 'assets');
    expect(assetsEvent).toMatchObject({
      phase: 'assets',
      sceneId: 'scene-01',
      provider: 'brave',
    });
  });

  it('propagates search cancellation instead of normalizing it as a provider failure', async () => {
    const controller = new AbortController();
    const leaseError = new Error('search lease lost');
    const search = vi.fn(async () => {
      controller.abort(leaseError);
      throw leaseError;
    });

    await expect(
      planVisualAssets({
        scenes: [
          { sceneId: 'scene-01', imageSearchIntent: ['target subject'] },
        ],
        workingDirectory: '/work/visual-assets',
        signal: controller.signal,
        dependencies: {
          acquireImage: vi.fn(),
          searchProviders: braveProviders(search),
          fingerprintImage: vi.fn(),
        },
      }),
    ).rejects.toBe(leaseError);
  });

  it('surfaces a non-Error provider failure', async () => {
    await expect(
      planVisualAssets({
        scenes: [
          {
            sceneId: 'scene-01',
            imageSearchIntent: ['developers team people'],
          },
        ],
        workingDirectory: '/work/visual-assets',
        dependencies: {
          acquireImage: vi.fn(),
          searchProviders: braveProviders(vi.fn().mockRejectedValue('offline')),
          fingerprintImage: vi.fn(),
        },
      }),
    ).rejects.toThrow('Visual image search failed for scene scene-01: offline');
  });

  it('reports safe aggregate causes when every candidate is rejected', async () => {
    const progress = vi.fn();
    const searched = [
      candidate('forbidden', 'brave'),
      candidate('too-short-a', 'brave'),
      candidate('too-short-b', 'brave'),
      candidate('transport', 'brave'),
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
        searchProviders: braveProviders(vi.fn().mockResolvedValue(searched)),
        fingerprintImage: vi.fn(),
      },
    });

    await expect(result).rejects.toThrow(
      'Visual scene scene-01 has no usable image after rejecting 4 candidate(s) (dimensions-too-small:2,http-403:1,other:1)',
    );
    await expect(result).rejects.not.toThrow(/media\.example|token|secret/i);
    // A scene that never got an asset reports what it rejected on the terminal
    // `exhausted` event; no `assets` event is ever emitted for it.
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'exhausted',
        sceneId: 'scene-01',
        rejectedCandidateCount: 4,
        rejectionSummary: 'dimensions-too-small:2,http-403:1,other:1',
      }),
    );
  });

  it('names the filter that removed the candidates a search did return', async () => {
    const searched = [
      {
        ...candidate('logo', 'brave'),
        imageUrl: 'https://i.example.test/logo.jpg',
      },
      {
        ...candidate('dupe', 'brave'),
        imageUrl: 'https://i.example.test/same.jpg',
      },
      {
        ...candidate('dupe2', 'brave'),
        imageUrl: 'https://i.example.test/same.jpg',
      },
    ];

    const result = planVisualAssets({
      scenes: scenes.slice(0, 1),
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage: vi.fn(),
        searchProviders: braveProviders(vi.fn().mockResolvedValue(searched)),
        fingerprintImage: vi.fn(),
      },
    });

    await expect(result).rejects.toThrow(/viableDrops=[a-z-]+:\d+/u);
    await expect(result).rejects.toThrow('returned=3');
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
          searchProviders: braveProviders(vi.fn()),
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
        searchProviders: braveProviders(searchImages),
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
      .mockRejectedValue(new Error('Brave Images search failed: 503'));

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
          searchProviders: braveProviders(searchImages),
          fingerprintImage: vi
            .fn()
            .mockResolvedValueOnce('0000000000000000')
            .mockResolvedValueOnce('ffffffffffffffff'),
        },
      }),
    ).rejects.toThrow(
      'Visual image search failed for scene scene-03: Brave Images search failed: 503',
    );
  });

  it('names the scene that paid for a rejected request and what it cost', async () => {
    const failure = await planVisualAssets({
      scenes: scenes.slice(0, 2),
      articleImages: [candidate('article-a')],
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('article-a')),
        searchProviders: braveProviders(
          vi
            .fn()
            .mockRejectedValue(new Error('Brave Images search failed: 503')),
        ),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      name: 'VisualSceneExhaustedError',
      sceneId: 'scene-02',
      reason: 'search-failure',
      providerFailures: ['Brave Images search failed: 503'],
    });
    // A request that threw before it could be recorded was still paid for, so
    // the suffix has to show it as spent against the episode's eight.
    expect((failure as Error).message).toContain(
      '[pool=0, attempted=0, requests=1/8, returned=0, viable=0]',
    );
  });

  it('does not throw when the request budget refuses a subject in strict mode', async () => {
    // Nine subjects against five pool searches plus three targeted retries:
    // the ninth is never asked at all. Even strict mode treats that as a
    // quality signal -- it raises for a provider that answered badly, not for
    // an episode that ran out of money.
    const pooled = { ...candidate('pooled', 'brave'), altText: 'pool subject' };
    const budgetScenes: VisualAssetScene[] = [
      { sceneId: 'scene-01', imageSearchIntent: ['pool subject'] },
      { sceneId: 'scene-02', imageSearchIntent: ['filler two'] },
      { sceneId: 'scene-03', imageSearchIntent: ['filler three'] },
      { sceneId: 'scene-04', imageSearchIntent: ['filler four'] },
      { sceneId: 'scene-05', imageSearchIntent: ['filler five'] },
      ...['Alpha', 'Bravo', 'Charlie', 'Delta'].map((entity, index) => ({
        sceneId: `scene-0${index + 6}`,
        imageSearchIntent: [`${entity} photo`],
        imageSearchEntities: [entity],
      })),
    ];
    const searchImages = searchByQuery({ 'pool subject': [pooled] });

    const result = await planVisualAssets({
      scenes: budgetScenes,
      workingDirectory: '/work/visual-assets',
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('pooled')),
        searchProviders: braveProviders(searchImages),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(searchImages.mock.calls.map(([query]) => query)).toEqual([
      'pool subject',
      'filler two',
      'filler three',
      'filler four',
      'filler five',
      'Alpha photo',
      'Bravo photo',
      'Charlie photo',
    ]);
    expect(result.imageSearch?.requestCount).toBe(8);
    expect(result.imageSearch?.budgetExhausted).toBe(true);
    expect(result.scenes.map((scene) => scene.assetId)).toEqual(
      Array.from({ length: budgetScenes.length }, () => 'image-01'),
    );
  });

  it('surfaces one provider failure and never re-asks the failed query', async () => {
    const searchImages = vi
      .fn()
      .mockRejectedValue(new Error('Brave Images search failed: 503'));

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
          searchProviders: braveProviders(searchImages),
          fingerprintImage: vi.fn(),
        },
      }),
    ).rejects.toThrow(
      'Visual image search failed for scene scene-01: Brave Images search failed: 503',
    );
    expect(searchImages).toHaveBeenCalledOnce();
  });

  it('reuses the immediately preceding image when it is the only one there is', async () => {
    // One repeated photo is a quality degradation; a failed episode is not.
    const progress = vi.fn();

    const result = await planVisualAssets({
      scenes: scenes.slice(0, 2),
      articleImages: [candidate('article-a')],
      workingDirectory: '/work/visual-assets',
      onProgress: progress,
      dependencies: {
        acquireImage: vi.fn().mockResolvedValue(acquired('article-a')),
        searchProviders: braveProviders(searchByQuery({})),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
      },
    });

    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-01' },
    ]);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'assets',
        sceneId: 'scene-02',
        provider: 'reuse',
        reuseKind: 'consecutive',
      }),
    );
  });

  it('resumes a checkpointed plan without renumbering or re-downloading it', async () => {
    const resumedAsset = {
      assetId: 'image-03',
      path: '/work/image-03.image',
      contentType: 'image/jpeg' as const,
      sha256: 'resumed'.padEnd(64, 'a').slice(0, 64),
      perceptualHash: '0000000000000000',
      width: 1600,
      height: 900,
      originalImageUrl: 'https://images.example.test/resumed.jpg',
      sourcePageUrl: 'https://publisher.example.test/resumed',
      provider: 'brave' as const,
      license: 'unknown' as const,
    };
    const alreadyOwned = {
      ...candidate('resumed', 'brave'),
      altText: 'second subject',
    };
    const fresh = { ...candidate('fresh', 'brave'), altText: 'second subject' };
    const acquireImage = vi.fn().mockResolvedValue(acquired('fresh'));

    const result = await planVisualAssets({
      scenes: scenes.slice(0, 2),
      workingDirectory: '/work/visual-assets',
      resumePlan: {
        assets: [resumedAsset],
        scenes: [{ sceneId: 'scene-01', assetId: 'image-03' }],
      },
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(
          searchByQuery({ 'second subject': [alreadyOwned, fresh] }),
        ),
        fingerprintImage: vi.fn().mockResolvedValue('ffffffffffffffff'),
      },
    });

    // A checkpoint that already holds `image-03` must mint `image-04`, and the
    // image it already downloaded must be recognised rather than fetched again.
    expect(acquireImage.mock.calls.map(([url]) => url)).toEqual([
      fresh.imageUrl,
    ]);
    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-03' },
      { sceneId: 'scene-02', assetId: 'image-04' },
    ]);
  });

  it('fails explicitly instead of producing an asset-none or text fallback', async () => {
    await expect(
      planVisualAssets({
        scenes: scenes.slice(0, 1),
        articleImages: [],
        workingDirectory: '/work/visual-assets',
        dependencies: {
          acquireImage: vi.fn(),
          searchProviders: braveProviders(vi.fn().mockResolvedValue([])),
          fingerprintImage: vi.fn(),
        },
      }),
    ).rejects.toThrow('Visual scene scene-01 has no usable image');
  });
});

describe('mentionsAnyEntity', () => {
  it('requires both token boundaries so a short name cannot match a longer word', () => {
    const suit = {
      ...candidate('business-attire', 'brave'),
      altText: 'man in a business suit walking',
    };

    // A left-only anchor handed this candidate the full mention bonus, and the
    // demoted aliases that reach ranking are exactly the short names -- Sui,
    // a16z -- that a prefix match cannot tell from an unrelated longer word.
    expect(mentionsAnyEntity(suit, ['Sui'])).toBe(false);
    expect(
      mentionsAnyEntity(
        { ...suit, altText: 'Sui validator hardware in a data centre' },
        ['Sui'],
      ),
    ).toBe(true);
    // A scene that names nothing has no identity to check.
    expect(mentionsAnyEntity(suit, [])).toBe(true);
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
