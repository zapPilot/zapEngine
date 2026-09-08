import { describe, expect, it, vi } from 'vitest';

import {
  BraveImagesProviderError,
  buildBraveImagesSearchUrl,
  searchBraveImages,
} from './brave-image-search.js';

const API_KEY = 'brave-test-key';

function braveResult(overrides: Record<string, unknown> = {}) {
  return {
    type: 'image_result',
    title: 'Coldcard Mk4 hardware wallet review',
    url: 'https://publisher.example.test/coldcard-mk4-review',
    source: 'publisher.example.test',
    thumbnail: { src: 'https://imgs.search.brave.com/thumb-abc' },
    properties: {
      url: 'https://images.publisher.example.test/coldcard-mk4.jpg',
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

describe('buildBraveImagesSearchUrl', () => {
  it('builds a strict SafeSearch query with spellcheck disabled', () => {
    const url = new URL(
      buildBraveImagesSearchUrl('  coldcard hardware wallet  ', { count: 35 }),
    );

    expect(url.origin + url.pathname).toBe(
      'https://api.search.brave.com/res/v1/images/search',
    );
    expect(url.searchParams.get('q')).toBe('coldcard hardware wallet');
    expect(url.searchParams.get('count')).toBe('35');
    expect(url.searchParams.get('safesearch')).toBe('strict');
    expect(url.searchParams.get('search_lang')).toBe('en');
    expect(url.searchParams.get('spellcheck')).toBe('false');
  });

  it('preserves unfamiliar proper nouns instead of allowing provider correction', () => {
    const url = new URL(buildBraveImagesSearchUrl('Blonskr'));

    expect(url.searchParams.get('q')).toBe('Blonskr');
    expect(url.searchParams.get('spellcheck')).toBe('false');
  });

  it('rejects empty queries and out-of-range counts', () => {
    expect(() => buildBraveImagesSearchUrl('   ')).toThrow(
      'Brave Images query must not be empty',
    );
    expect(() => buildBraveImagesSearchUrl('ok', { count: 101 })).toThrow(
      'between 1 and 100',
    );
    expect(() => buildBraveImagesSearchUrl('ok', { count: 0 })).toThrow(
      'between 1 and 100',
    );
  });
});

describe('searchBraveImages', () => {
  it('sends the subscription token and maps the publisher image, not the Brave thumbnail', async () => {
    const fetchJson = vi
      .fn()
      .mockResolvedValue(jsonResponse({ results: [braveResult()] }));

    const candidates = await searchBraveImages('coldcard', API_KEY, {
      count: 35,
      fetchJson: fetchJson as unknown as typeof fetch,
    });

    const [, init] = fetchJson.mock.calls[0] as [string, RequestInit];
    expect(
      (init.headers as Record<string, string>)['x-subscription-token'],
    ).toBe(API_KEY);
    expect(candidates).toEqual([
      {
        imageUrl: 'https://images.publisher.example.test/coldcard-mk4.jpg',
        sourceUrl: 'https://publisher.example.test/coldcard-mk4-review',
        origin: 'brave',
        altText: 'Coldcard Mk4 hardware wallet review',
      },
    ]);
  });

  it('drops results that carry no usable publisher image URL', async () => {
    const fetchJson = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          braveResult({ properties: { url: 'not-a-url' } }),
          braveResult({ url: undefined }),
          braveResult({ title: '   ' }),
        ],
      }),
    );

    const candidates = await searchBraveImages('coldcard', API_KEY, {
      fetchJson: fetchJson as unknown as typeof fetch,
    });

    // Only the blank-title result survives, and it carries no altText.
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).not.toHaveProperty('altText');
  });

  it('raises a typed provider error for rate limits, outages, and unexpected bodies', async () => {
    const rateLimited = vi
      .fn()
      .mockResolvedValue(new Response('slow down', { status: 429 }));
    await expect(
      searchBraveImages('coldcard', API_KEY, {
        fetchJson: rateLimited as unknown as typeof fetch,
      }),
    ).rejects.toThrow(BraveImagesProviderError);

    const outage = vi
      .fn()
      .mockResolvedValue(new Response('boom', { status: 503 }));
    await expect(
      searchBraveImages('coldcard', API_KEY, {
        fetchJson: outage as unknown as typeof fetch,
      }),
    ).rejects.toThrow('Brave Images search failed: 503');

    const wrongShape = vi
      .fn()
      .mockResolvedValue(jsonResponse({ images: [braveResult()] }));
    await expect(
      searchBraveImages('coldcard', API_KEY, {
        fetchJson: wrongShape as unknown as typeof fetch,
      }),
    ).rejects.toThrow('unexpected response shape');
  });

  it('wraps a transport failure rather than leaking it as an unknown error', async () => {
    const offline = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));

    await expect(
      searchBraveImages('coldcard', API_KEY, {
        fetchJson: offline as unknown as typeof fetch,
      }),
    ).rejects.toThrow('Brave Images provider request failed: ENOTFOUND');
  });

  it('refuses to search without a key instead of returning an empty result set', async () => {
    const fetchJson = vi.fn();

    await expect(searchBraveImages('coldcard', '   ')).rejects.toThrow(
      'Brave Search API key must not be empty',
    );
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('aborts the in-flight request with the caller signal and rethrows it untouched', async () => {
    const controller = new AbortController();
    const leaseLost = new Error('render lease lost');
    const fetchJson = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(new Error('aborted'));
            },
            { once: true },
          );
          controller.abort(leaseLost);
        }),
    );

    // An abort is the caller giving up, not a provider fault, so it must not be
    // rewritten into a BraveImagesProviderError the planner would count.
    await expect(
      searchBraveImages('coldcard', API_KEY, {
        signal: controller.signal,
        fetchJson: fetchJson as unknown as typeof fetch,
      }),
    ).rejects.not.toThrow(BraveImagesProviderError);
  });
});
