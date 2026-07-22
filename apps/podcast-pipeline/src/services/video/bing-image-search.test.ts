import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BING_IMAGES_FETCH_TIMEOUT_MS,
  buildBingImagesSearchUrl,
  type FetchBingImagesHtml,
  parseBingImagesHtml,
  searchBingImages,
} from './bing-image-search.js';

afterEach(() => {
  vi.useRealTimers();
});

async function fixtureHtml(): Promise<string> {
  return readFile(
    new URL('./__fixtures__/bing-images.html', import.meta.url),
    'utf8',
  );
}

describe('buildBingImagesSearchUrl', () => {
  it('builds a strict SafeSearch URL with bounded paging', () => {
    const result = new URL(
      buildBingImagesSearchUrl('  regional grid storage  ', {
        count: 24,
        offset: 48,
      }),
    );

    expect(result.origin).toBe('https://www.bing.com');
    expect(result.pathname).toBe('/images/search');
    expect(result.searchParams.get('q')).toBe(
      'regional grid storage real world documentary photograph -text -typography -infographic -diagram -chart -presentation -slide -poster -tutorial -screenshot -banner -cover -quote -guide -explained -report -ppt -powerpoint -template -vector -clipart',
    );
    expect(result.searchParams.get('adlt')).toBe('strict');
    expect(result.searchParams.get('first')).toBe('49');
    expect(result.searchParams.get('count')).toBe('24');
    expect(result.searchParams.get('qft')).toBe(
      '+filterui:imagesize-large+filterui:aspect-wide+filterui:photo-photo',
    );
  });

  it.each([
    ['', {}, 'query must not be empty'],
    ['grid', { count: 0 }, 'count must be an integer between 1 and 150'],
    ['grid', { offset: -1 }, 'offset must be an integer between 0'],
  ])('rejects invalid query or paging input', (query, options, message) => {
    expect(() => buildBingImagesSearchUrl(query, options)).toThrow(message);
  });
});

describe('parseBingImagesHtml', () => {
  it('parses a.iusc m JSON from a fixed HTML fixture', async () => {
    const candidates = parseBingImagesHtml(await fixtureHtml());

    expect(candidates).toEqual([
      {
        imageUrl: 'https://media.example.test/grid-control-room.jpg',
        sourceUrl:
          'https://publisher.example.test/grid-modernization?ref=images&edition=us',
        origin: 'bing',
        altText: 'Grid & control room',
        width: 2400,
        height: 1350,
      },
      {
        imageUrl: 'https://media.example.test/transmission.webp',
        sourceUrl: 'https://agency.example.test/reports/transmission',
        origin: 'bing',
        altText: 'High-voltage transmission lines',
        width: 1800,
        height: 1200,
      },
    ]);
  });

  it('returns an empty list for markup without Bing image result anchors', () => {
    expect(parseBingImagesHtml('<p>No image results</p>')).toEqual([]);
  });
});

describe('searchBingImages', () => {
  it('acquires and parses HTML through an injected fetch without an API key', async () => {
    const fetchHtml = vi.fn<FetchBingImagesHtml>(
      async () =>
        new Response(await fixtureHtml(), {
          status: 200,
          statusText: 'OK',
        }),
    );

    const candidates = await searchBingImages('grid reliability', {
      fetchHtml,
      count: 10,
    });

    expect(candidates).toHaveLength(2);
    expect(fetchHtml).toHaveBeenCalledOnce();
    const firstCall = fetchHtml.mock.calls[0];
    if (!firstCall) throw new Error('Expected a Bing Images fetch call');
    const [requestedUrl, requestInit] = firstCall;
    expect(new URL(requestedUrl).searchParams.get('adlt')).toBe('strict');
    expect(requestInit).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: 'text/html,application/xhtml+xml',
        }),
      }),
    );
    expect(new Headers(requestInit.headers).has('authorization')).toBe(false);
  });

  it('requests Traditional Chinese results for a Chinese search intent', async () => {
    const fetchHtml = vi.fn<FetchBingImagesHtml>(
      async () => new Response(await fixtureHtml()),
    );

    await searchBingImages('區塊鏈 機器經濟', { fetchHtml });

    const request = fetchHtml.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get('accept-language')).toBe(
      'zh-TW,zh;q=0.9,en;q=0.8',
    );
  });

  it('throws for an unsuccessful HTML response', async () => {
    const fetchHtml = vi.fn<FetchBingImagesHtml>(
      async () =>
        new Response('', {
          status: 429,
          statusText: 'Too Many Requests',
        }),
    );

    await expect(
      searchBingImages('grid reliability', { fetchHtml }),
    ).rejects.toThrow('Bing Images search failed: 429 Too Many Requests');
  });

  it('fails explicitly when Bing markup changes', async () => {
    const fetchHtml = vi.fn<FetchBingImagesHtml>(
      async () =>
        new Response('<a class="new-result-shape">No iusc metadata</a>', {
          status: 200,
          statusText: 'OK',
        }),
    );

    await expect(
      searchBingImages('grid reliability', { fetchHtml }),
    ).rejects.toThrow('Bing Images search returned no parseable image results');
  });

  it('returns an empty candidate list for an explicit zero-results page', async () => {
    const fetchHtml = vi.fn<FetchBingImagesHtml>(
      async () =>
        new Response(
          '<div id="mmComponent_no_results">No image results found</div>',
          { status: 200, statusText: 'OK' },
        ),
    );

    await expect(
      searchBingImages('an intentionally narrow query', { fetchHtml }),
    ).resolves.toEqual([]);
  });

  it('aborts a stalled HTML request at the fixed deadline', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchHtml = vi.fn<FetchBingImagesHtml>(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          requestSignal = init.signal ?? undefined;
          requestSignal?.addEventListener(
            'abort',
            () => reject(abortError(requestSignal)),
            { once: true },
          );
        }),
    );

    const result = searchBingImages('grid reliability', { fetchHtml });
    const assertion = expect(result).rejects.toThrow(
      `Bing Images provider request failed: Bing Images search timed out after ${BING_IMAGES_FETCH_TIMEOUT_MS}ms`,
    );
    await vi.advanceTimersByTimeAsync(BING_IMAGES_FETCH_TIMEOUT_MS);

    await assertion;
    expect(requestSignal?.aborted).toBe(true);
  });

  it('propagates caller cancellation to the HTML request', async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const fetchHtml = vi.fn<FetchBingImagesHtml>(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          requestSignal = init.signal ?? undefined;
          requestSignal?.addEventListener(
            'abort',
            () => reject(abortError(requestSignal)),
            { once: true },
          );
        }),
    );

    const result = searchBingImages('grid reliability', {
      fetchHtml,
      signal: controller.signal,
    });
    controller.abort(new Error('visual lease lost'));

    await expect(result).rejects.toThrow('visual lease lost');
    expect(requestSignal?.aborted).toBe(true);
  });
});

function abortError(signal: AbortSignal | undefined): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new Error('Request aborted');
}
