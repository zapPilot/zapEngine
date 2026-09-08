import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import type { AcquiredRemoteImage } from './assets.js';
import { planPodcastVisualAssets } from './podcast-visual-assets.js';
import { parseVisualSubjectCatalog } from './storyboard/subject-catalog.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('podcast visual assets subject ranking', () => {
  it('keeps Coinbase as lead and ranks Alpaca/B20 name collisions last', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'podcast-visual-v8-'));
    directories.push(directory);

    const catalog = parseVisualSubjectCatalog({
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
        {
          id: 'subject-alpaca',
          canonicalName: 'Alpaca',
          type: 'company',
          aliases: ['Alpaca Markets'],
          storyRole: 'secondary',
          evidenceSceneIds: ['scene-02'],
          searchQueries: ['Alpaca custody broker'],
          identityHints: ['brokerage', 'custody'],
          negativeHints: ['animal', 'alpacas'],
          officialDomains: [],
        },
        {
          id: 'subject-b20',
          canonicalName: 'B20',
          type: 'standard',
          aliases: [],
          storyRole: 'secondary',
          evidenceSceneIds: ['scene-03'],
          searchQueries: ['B20 tokenized stocks'],
          identityHints: ['Base', 'ERC-20'],
          negativeHints: ['Profoto', 'camera', 'Honda', 'engine'],
          officialDomains: [],
        },
      ],
    });

    const badUrls = new Set([
      'https://images.example.test/binance.jpg',
      'https://images.example.test/alpacas.jpg',
      'https://images.example.test/profoto-b20.jpg',
      'https://images.example.test/honda-b20.jpg',
    ]);
    const downloaded: string[] = [];
    const acquireImage = vi.fn(
      async (url: string): Promise<AcquiredRemoteImage> => {
        downloaded.push(url);
        const id = new URL(url).pathname.split('/').pop()!.replace('.jpg', '');
        let hashCharacter = 'c';
        if (id.includes('coinbase')) hashCharacter = 'a';
        else if (id.includes('alpaca-markets')) hashCharacter = 'b';
        return {
          path: join(directory, `${id}.jpg`),
          contentType: 'image/jpeg',
          sha256: hashCharacter.repeat(64),
          width: 1600,
          height: 900,
        };
      },
    );
    const fingerprintImage = vi
      .fn()
      .mockResolvedValueOnce('0000000000000000')
      .mockResolvedValueOnce('1111111111111111')
      .mockResolvedValueOnce('2222222222222222');
    const search = vi.fn(async (query: string): Promise<ImageCandidate[]> => {
      const lowered = query.toLowerCase();
      if (lowered.includes('coinbase')) {
        return [
          braveCandidate(
            'binance',
            'Binance tokenized stocks launch',
            'https://coinmarketcap.example.test/binance-tokenized-stocks',
          ),
          braveCandidate(
            'coinbase',
            'Coinbase tokenized stocks on Base',
            'https://news.example.test/coinbase-tokenized-stocks',
          ),
        ];
      }
      if (lowered.includes('alpaca')) {
        return [
          braveCandidate(
            'alpacas',
            'Cute alpacas in a field',
            'https://unsplash.example.test/s/photos/alpacas',
          ),
          braveCandidate(
            'alpaca-markets',
            'Alpaca Markets brokerage custody',
            'https://news.example.test/alpaca-markets',
          ),
        ];
      }
      if (lowered.includes('b20')) {
        return [
          braveCandidate(
            'profoto-b20',
            'Profoto B20 camera flash review',
            'https://camera.example.test/profoto-b20-review',
          ),
          braveCandidate(
            'honda-b20',
            'Honda B20 engine differences',
            'https://cars.example.test/honda-b20-engine',
          ),
          braveCandidate(
            'base-b20',
            'Base B20 token standard for tokenized stocks',
            'https://basemedia.example.test/base-b20-token-standard',
          ),
        ];
      }
      return [];
    });

    const plan = await planPodcastVisualAssets({
      scenes: [
        { sceneId: 'scene-01', imageSearchIntent: ['tokenized stocks'] },
        { sceneId: 'scene-02', imageSearchIntent: ['custody'] },
        { sceneId: 'scene-03', imageSearchIntent: ['token standard'] },
      ],
      articleImages: [],
      subjectCatalog: catalog,
      sceneAssignments: [
        {
          sceneId: 'scene-01',
          subjectIds: ['subject-coinbase'],
          selectionReason: 'direct',
        },
        {
          sceneId: 'scene-02',
          subjectIds: ['subject-alpaca'],
          selectionReason: 'direct',
        },
        {
          sceneId: 'scene-03',
          subjectIds: ['subject-b20'],
          selectionReason: 'direct',
        },
      ],
      workingDirectory: join(directory, 'images'),
      selectionMode: 'resilient',
      dependencies: {
        acquireImage,
        fingerprintImage,
        searchProviders: [{ origin: 'brave', search }],
      },
    });

    expect(catalog.subjects.map((subject) => subject.canonicalName)).toEqual([
      'Coinbase',
      'Alpaca Markets',
      'Base B20',
    ]);
    // The catalog's own `searchQueries` reach the provider verbatim, so a
    // disambiguated subject is searched by the ambiguous name the episode
    // actually wrote -- `B20 tokenized stocks`, not `Base B20 B20 tokenized
    // stocks`. Identity is then a ranking bonus: the camera flash and the
    // engine stay in the pool and lose on how little else of the query they
    // answer. Each candidate is a different publisher, as three real search
    // results are, so none of them pays another's host-diversity penalty.
    expect(search.mock.calls.map(([query]) => query)).toEqual([
      'Coinbase tokenized stocks',
      'Alpaca custody broker',
      'B20 tokenized stocks',
    ]);
    // One request per subject, and no scene had to pay for a targeted retry.
    expect(plan.imageSearch?.requests.map((request) => request.kind)).toEqual([
      'primary',
      'primary',
      'primary',
    ]);
    expect(plan.imageSearch?.scenes.map((scene) => scene.selection)).toEqual([
      'pool',
      'pool',
      'pool',
    ]);
    expect(downloaded.some((url) => badUrls.has(url))).toBe(false);
    expect(plan.assets.map((asset) => asset.sourcePageUrl)).toEqual([
      'https://news.example.test/coinbase-tokenized-stocks',
      'https://news.example.test/alpaca-markets',
      'https://basemedia.example.test/base-b20-token-standard',
    ]);
    expect(plan.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-02' },
      { sceneId: 'scene-03', assetId: 'image-03' },
    ]);
  });

  // The counter-case to the test above, and the production failure that
  // retired the hard identity gate: a news photograph rarely repeats its
  // subject's name in its own metadata, so gating on the mention starved
  // scenes whose only candidate was perfectly usable.
  it('downloads a candidate that never names the subject when it is the only one', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'podcast-visual-v8-'));
    directories.push(directory);

    const catalog = parseVisualSubjectCatalog({
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
          identityHints: ['crypto exchange'],
          negativeHints: [],
          officialDomains: [],
        },
      ],
    });

    const unnamedCandidate = braveCandidate(
      'brian-armstrong-summit',
      'Chief executive speaking at a fintech summit',
      'https://news.example.test/fintech-summit-keynote',
    );
    const downloaded: string[] = [];
    const acquireImage = vi.fn(
      async (url: string): Promise<AcquiredRemoteImage> => {
        downloaded.push(url);
        return {
          path: join(directory, 'summit.jpg'),
          contentType: 'image/jpeg',
          sha256: 'd'.repeat(64),
          width: 1600,
          height: 900,
        };
      },
    );

    const plan = await planPodcastVisualAssets({
      scenes: [
        { sceneId: 'scene-01', imageSearchIntent: ['tokenized stocks'] },
      ],
      articleImages: [],
      subjectCatalog: catalog,
      sceneAssignments: [
        {
          sceneId: 'scene-01',
          subjectIds: ['subject-coinbase'],
          selectionReason: 'direct',
        },
      ],
      workingDirectory: join(directory, 'images'),
      selectionMode: 'resilient',
      dependencies: {
        acquireImage,
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
        searchProviders: [
          {
            origin: 'brave',
            search: vi.fn().mockResolvedValue([unnamedCandidate]),
          },
        ],
      },
    });

    expect(downloaded).toEqual([unnamedCandidate.imageUrl]);
    expect(plan.scenes).toEqual([{ sceneId: 'scene-01', assetId: 'image-01' }]);
    expect(plan.imageSearch?.scenes[0]).toMatchObject({
      selection: 'pool',
      fallbackReason: null,
    });
  });

  // The E1 production shape: disambiguation rewrote the subject into
  // `blockchain Sui` and demoted `Sui` into `aliases[0]`, and the entity list
  // kept only the canonical name. No news photo's metadata spells `blockchain
  // Sui`, so every candidate of that subject scored a zero identity bonus and
  // an off-subject Reuters photo won on editorial reputation alone.
  it('credits the demoted short name so its own subject outranks an off-subject photo', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'podcast-visual-v8-'));
    directories.push(directory);

    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-sui',
      subjects: [
        {
          id: 'subject-sui',
          canonicalName: 'Sui',
          type: 'protocol',
          aliases: [],
          storyRole: 'primary',
          evidenceSceneIds: ['scene-01'],
          searchQueries: ['Sui validators'],
          identityHints: ['blockchain'],
          negativeHints: [],
          officialDomains: [],
        },
      ],
    });

    const offSubject = braveCandidate(
      'fed-press-conference',
      'Federal Reserve press conference',
      'https://www.reuters.com/markets/fed-press-conference',
    );
    const onSubject = braveCandidate(
      'sui-validator-network',
      'Validators securing the network',
      'https://news.example.test/sui-validator-network',
    );
    const downloaded: string[] = [];
    const acquireImage = vi.fn(
      async (url: string): Promise<AcquiredRemoteImage> => {
        downloaded.push(url);
        return {
          path: join(directory, 'validator.jpg'),
          contentType: 'image/jpeg',
          sha256: 'e'.repeat(64),
          width: 1600,
          height: 900,
        };
      },
    );

    const plan = await planPodcastVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['validator set'] }],
      articleImages: [],
      subjectCatalog: catalog,
      sceneAssignments: [
        {
          sceneId: 'scene-01',
          subjectIds: ['subject-sui'],
          selectionReason: 'direct',
        },
      ],
      workingDirectory: join(directory, 'images'),
      selectionMode: 'resilient',
      dependencies: {
        acquireImage,
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
        searchProviders: [
          {
            origin: 'brave',
            search: vi.fn().mockResolvedValue([offSubject, onSubject]),
          },
        ],
      },
    });

    expect(downloaded).toEqual([onSubject.imageUrl]);
    expect(plan.imageSearch?.scenes[0]).toMatchObject({
      selection: 'pool',
      fallbackReason: null,
    });
    // `subjectLabel` is the operator-facing serialization of the scene's
    // `imageSearchEntities`, so it is where the entity list is observable.
    expect(plan.imageSearch?.requests[0]?.subjectLabel).toBe(
      'blockchain Sui + Sui',
    );
  });

  it('holds a four-subject scene at the four entities the plan can persist', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'podcast-visual-v8-'));
    directories.push(directory);

    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-sui',
      subjects: [
        ambiguousSubject('subject-sui', 'Sui', 'blockchain', 'Sui validators', {
          storyRole: 'primary',
        }),
        ambiguousSubject(
          'subject-a16z',
          'a16z',
          'venture capital',
          'a16z partners',
        ),
        ambiguousSubject(
          'subject-base',
          'Base',
          'layer 2 network',
          'Base network launch',
        ),
        ambiguousSubject(
          'subject-aave',
          'Aave',
          'lending protocol',
          'Aave lending pools',
        ),
      ],
    });

    const plan = await planPodcastVisualAssets({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['validator set'] }],
      articleImages: [],
      subjectCatalog: catalog,
      sceneAssignments: [
        {
          sceneId: 'scene-01',
          subjectIds: [
            'subject-sui',
            'subject-a16z',
            'subject-base',
            'subject-aave',
          ],
          selectionReason: 'direct',
        },
      ],
      workingDirectory: join(directory, 'images'),
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(
          async (): Promise<AcquiredRemoteImage> => ({
            path: join(directory, 'validator.jpg'),
            contentType: 'image/jpeg',
            sha256: 'f'.repeat(64),
            width: 1600,
            height: 900,
          }),
        ),
        fingerprintImage: vi.fn().mockResolvedValue('0000000000000000'),
        searchProviders: [
          {
            origin: 'brave',
            search: vi
              .fn()
              .mockResolvedValue([
                braveCandidate(
                  'sui-validator-network',
                  'Validators securing the network',
                  'https://news.example.test/sui-validator-network',
                ),
              ]),
          },
        ],
      },
    });

    // Four subjects already fill the cap the persisted plan enforces, so the
    // demoted originals are what yields rather than a subject's whole identity.
    expect(plan.imageSearch?.requests[0]?.subjectLabel.split(' + ')).toEqual([
      'blockchain Sui',
      'venture capital a16z',
      'layer 2 network Base',
      'lending protocol Aave',
    ]);
  });
});

function ambiguousSubject(
  id: string,
  canonicalName: string,
  identityHint: string,
  searchQuery: string,
  overrides: { storyRole?: 'primary' | 'secondary' } = {},
): unknown {
  return {
    id,
    canonicalName,
    type: 'protocol',
    aliases: [],
    storyRole: overrides.storyRole ?? 'secondary',
    evidenceSceneIds: ['scene-01'],
    searchQueries: [searchQuery],
    identityHints: [identityHint],
    negativeHints: [],
    officialDomains: [],
  };
}

function braveCandidate(
  id: string,
  altText: string,
  sourceUrl: string,
): ImageCandidate {
  return {
    imageUrl: `https://images.example.test/${id}.jpg`,
    sourceUrl,
    altText,
    origin: 'brave',
  };
}
