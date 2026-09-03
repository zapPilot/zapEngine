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

describe('podcast visual assets v8 identity gate', () => {
  it('keeps Coinbase as lead and rejects Alpaca/B20 name collisions before download', async () => {
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
            'https://news.example.test/base-b20-token-standard',
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
    // stocks`. Identity is enforced one step later: the gate below still holds
    // every candidate to the disambiguated canonical name, which is why the
    // camera flash and the engine are rejected from this very result set.
    expect(search.mock.calls.map(([query]) => query)).toEqual([
      'Coinbase tokenized stocks',
      'Alpaca custody broker',
      'B20 tokenized stocks',
    ]);
    expect(downloaded.some((url) => badUrls.has(url))).toBe(false);
    expect(plan.assets.map((asset) => asset.sourcePageUrl)).toEqual([
      'https://news.example.test/coinbase-tokenized-stocks',
      'https://news.example.test/alpaca-markets',
      'https://news.example.test/base-b20-token-standard',
    ]);
    expect(plan.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-02' },
      { sceneId: 'scene-03', assetId: 'image-03' },
    ]);
  });
});

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
