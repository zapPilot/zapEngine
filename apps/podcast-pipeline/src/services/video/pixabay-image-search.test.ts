import { describe, expect, it, vi } from 'vitest';

import {
  buildPixabaySearchUrl,
  searchPixabayImages,
} from './pixabay-image-search.js';

const API_KEY = 'pixabay-test-key';

function pixabayHit(overrides: Record<string, unknown> = {}) {
  return {
    pageURL: 'https://pixabay.com/photos/stadium-football-98765/',
    tags: 'stadium, football, crowd',
    user: 'photofan',
    user_id: 4_242,
    imageWidth: 5_120,
    imageHeight: 2_880,
    largeImageURL: 'https://cdn.pixabay.com/photo/stadium_1280.jpg',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('buildPixabaySearchUrl', () => {
  it('builds a safesearch photo query with dimension floors', () => {
    const url = new URL(buildPixabaySearchUrl('world cup', API_KEY));
    expect(url.origin + url.pathname).toBe('https://pixabay.com/api/');
    expect(url.searchParams.get('key')).toBe(API_KEY);
    expect(url.searchParams.get('q')).toBe('world cup');
    expect(url.searchParams.get('image_type')).toBe('photo');
    expect(url.searchParams.get('safesearch')).toBe('true');
    expect(url.searchParams.get('min_width')).toBe('1000');
    expect(url.searchParams.get('min_height')).toBe('800');
  });

  it('truncates queries beyond the 100-character API limit', () => {
    const url = new URL(buildPixabaySearchUrl('a'.repeat(140), API_KEY));
    expect(url.searchParams.get('q')).toHaveLength(100);
  });

  it('rejects empty queries and out-of-range counts', () => {
    expect(() => buildPixabaySearchUrl('  ', API_KEY)).toThrow(
      'Pixabay query must not be empty',
    );
    expect(() => buildPixabaySearchUrl('ok', API_KEY, { count: 2 })).toThrow(
      'between 3 and 200',
    );
  });
});

describe('searchPixabayImages', () => {
  it('maps hits to candidates scaled to the largeImageURL rendition', async () => {
    const fetchJson = vi
      .fn()
      .mockResolvedValue(jsonResponse({ hits: [pixabayHit()] }));

    const candidates = await searchPixabayImages('world cup', API_KEY, {
      fetchJson,
    });

    expect(candidates).toEqual([
      {
        imageUrl: 'https://cdn.pixabay.com/photo/stadium_1280.jpg',
        sourceUrl: 'https://pixabay.com/photos/stadium-football-98765/',
        origin: 'pixabay',
        width: 1_280,
        height: 720,
        altText: 'stadium, football, crowd',
        photographer: 'photofan',
        photographerUrl: 'https://pixabay.com/users/photofan-4242/',
      },
    ]);
  });

  it('prefers the fullHD rendition when the account exposes it', async () => {
    const fetchJson = vi.fn().mockResolvedValue(
      jsonResponse({
        hits: [
          pixabayHit({
            fullHDURL: 'https://cdn.pixabay.com/photo/stadium_1920.jpg',
          }),
        ],
      }),
    );

    const [candidate] = await searchPixabayImages('world cup', API_KEY, {
      fetchJson,
    });
    expect(candidate).toMatchObject({
      imageUrl: 'https://cdn.pixabay.com/photo/stadium_1920.jpg',
      width: 1_920,
      height: 1_080,
    });
  });

  it('skips malformed hits and returns an empty list for zero results', async () => {
    const mixed = vi.fn().mockResolvedValue(
      jsonResponse({
        hits: [{ nonsense: true }, pixabayHit({ tags: null, user: null })],
      }),
    );
    const candidates = await searchPixabayImages('world cup', API_KEY, {
      fetchJson: mixed,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).not.toHaveProperty('altText');
    expect(candidates[0]).not.toHaveProperty('photographer');

    const empty = vi.fn().mockResolvedValue(jsonResponse({ hits: [] }));
    await expect(
      searchPixabayImages('nothing here', API_KEY, { fetchJson: empty }),
    ).resolves.toEqual([]);
  });

  it('throws a typed error on HTTP failures and malformed bodies', async () => {
    const rateLimited = vi
      .fn()
      .mockResolvedValue(
        new Response('API rate limit exceeded', { status: 429 }),
      );
    await expect(
      searchPixabayImages('world cup', API_KEY, { fetchJson: rateLimited }),
    ).rejects.toThrow('Pixabay search failed: 429');

    const malformed = vi
      .fn()
      .mockResolvedValue(jsonResponse({ unexpected: true }));
    await expect(
      searchPixabayImages('world cup', API_KEY, { fetchJson: malformed }),
    ).rejects.toThrow('Pixabay search returned an unexpected response shape');
  });

  it('wraps network failures and rejects an empty API key', async () => {
    const fetchJson = vi.fn().mockRejectedValue(new Error('socket hang up'));
    await expect(
      searchPixabayImages('world cup', API_KEY, { fetchJson }),
    ).rejects.toThrow('Pixabay provider request failed: socket hang up');

    await expect(searchPixabayImages('world cup', ' ')).rejects.toThrow(
      'Pixabay API key must not be empty',
    );
  });
});
