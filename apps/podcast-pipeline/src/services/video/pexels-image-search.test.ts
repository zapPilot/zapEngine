import { describe, expect, it, vi } from 'vitest';

import {
  buildPexelsSearchUrl,
  searchPexelsImages,
} from './pexels-image-search.js';

const API_KEY = 'pexels-test-key';

function pexelsPhoto(overrides: Record<string, unknown> = {}) {
  return {
    width: 3_760,
    height: 2_820,
    url: 'https://www.pexels.com/photo/world-cup-stadium-12345/',
    alt: 'World cup stadium at night',
    photographer: 'Jane Doe',
    photographer_url: 'https://www.pexels.com/@jane-doe',
    src: {
      large2x:
        'https://images.pexels.com/photos/12345/pexels-photo-12345.jpeg?w=1880',
    },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('buildPexelsSearchUrl', () => {
  it('builds a square-orientation search with the requested page size', () => {
    const url = new URL(buildPexelsSearchUrl('world cup', { count: 35 }));
    expect(url.origin + url.pathname).toBe('https://api.pexels.com/v1/search');
    expect(url.searchParams.get('query')).toBe('world cup');
    expect(url.searchParams.get('per_page')).toBe('35');
    expect(url.searchParams.get('orientation')).toBe('square');
  });

  it('rejects empty queries and out-of-range counts', () => {
    expect(() => buildPexelsSearchUrl('  ')).toThrow(
      'Pexels query must not be empty',
    );
    expect(() => buildPexelsSearchUrl('ok', { count: 81 })).toThrow(
      'between 1 and 80',
    );
  });
});

describe('searchPexelsImages', () => {
  it('sends the API key and maps photos to scaled large2x candidates', async () => {
    const fetchJson = vi
      .fn()
      .mockResolvedValue(jsonResponse({ photos: [pexelsPhoto()] }));

    const candidates = await searchPexelsImages('world cup', API_KEY, {
      fetchJson,
    });

    const [, init] = fetchJson.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['authorization']).toBe(
      API_KEY,
    );
    expect(candidates).toEqual([
      {
        imageUrl:
          'https://images.pexels.com/photos/12345/pexels-photo-12345.jpeg?w=1880',
        sourceUrl: 'https://www.pexels.com/photo/world-cup-stadium-12345/',
        origin: 'pexels',
        width: 1_880,
        height: 1_410,
        altText: 'World cup stadium at night',
        photographer: 'Jane Doe',
        photographerUrl: 'https://www.pexels.com/@jane-doe',
      },
    ]);
  });

  it('keeps original dimensions when the photo is below the rendition cap', async () => {
    const fetchJson = vi.fn().mockResolvedValue(
      jsonResponse({
        photos: [pexelsPhoto({ width: 1_600, height: 1_200 })],
      }),
    );

    const [candidate] = await searchPexelsImages('world cup', API_KEY, {
      fetchJson,
    });
    expect(candidate).toMatchObject({ width: 1_600, height: 1_200 });
  });

  it('skips malformed photo entries but keeps the valid ones', async () => {
    const fetchJson = vi.fn().mockResolvedValue(
      jsonResponse({
        photos: [{ nonsense: true }, pexelsPhoto({ alt: null })],
      }),
    );

    const candidates = await searchPexelsImages('world cup', API_KEY, {
      fetchJson,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).not.toHaveProperty('altText');
  });

  it('returns an empty list for an empty result set', async () => {
    const fetchJson = vi.fn().mockResolvedValue(jsonResponse({ photos: [] }));
    await expect(
      searchPexelsImages('nothing here', API_KEY, { fetchJson }),
    ).resolves.toEqual([]);
  });

  it('throws a typed error on HTTP failures and malformed bodies', async () => {
    const rateLimited = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'slow down' }, 429));
    await expect(
      searchPexelsImages('world cup', API_KEY, { fetchJson: rateLimited }),
    ).rejects.toThrow('Pexels search failed: 429');

    const malformed = vi
      .fn()
      .mockResolvedValue(jsonResponse({ unexpected: true }));
    await expect(
      searchPexelsImages('world cup', API_KEY, { fetchJson: malformed }),
    ).rejects.toThrow('Pexels search returned an unexpected response shape');
  });

  it('wraps network failures and rejects an empty API key', async () => {
    const fetchJson = vi.fn().mockRejectedValue(new Error('socket hang up'));
    await expect(
      searchPexelsImages('world cup', API_KEY, { fetchJson }),
    ).rejects.toThrow('Pexels provider request failed: socket hang up');

    await expect(searchPexelsImages('world cup', '  ')).rejects.toThrow(
      'Pexels API key must not be empty',
    );
  });
});
