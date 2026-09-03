import { afterEach, describe, expect, it, vi } from 'vitest';

const searchBraveImages = vi.hoisted(() => vi.fn());

vi.mock('./brave-image-search.js', () => ({
  BRAVE_MAX_RESULT_COUNT: 100,
  searchBraveImages,
}));

import { defaultImageSearchProviders } from './image-search-provider.js';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('defaultImageSearchProviders', () => {
  it('exposes Brave as the only external provider', () => {
    const providers = defaultImageSearchProviders({
      BRAVE_SEARCH_API_KEY: 'brave-key',
    });
    expect(
      providers.map((provider) => [provider.origin, provider.maxResults]),
    ).toEqual([['brave', 100]]);
  });

  it('fails closed without a Brave key instead of degrading to stock imagery', () => {
    expect(() => defaultImageSearchProviders({})).toThrow(
      'Missing required environment variable: BRAVE_SEARCH_API_KEY',
    );
    expect(() =>
      defaultImageSearchProviders({ BRAVE_SEARCH_API_KEY: '   ' }),
    ).toThrow('Missing required environment variable: BRAVE_SEARCH_API_KEY');
  });

  it('passes the request count and abort signal through to Brave', async () => {
    searchBraveImages.mockResolvedValue([]);
    const [provider] = defaultImageSearchProviders({
      BRAVE_SEARCH_API_KEY: 'brave-key',
    });
    const controller = new AbortController();

    await provider!.search('query');
    await provider!.search('query', {
      count: 7,
      signal: controller.signal,
    });

    expect(searchBraveImages).toHaveBeenNthCalledWith(
      1,
      'query',
      'brave-key',
      {},
    );
    expect(searchBraveImages).toHaveBeenNthCalledWith(2, 'query', 'brave-key', {
      count: 7,
      signal: controller.signal,
    });
  });

  it('uses process env by default', () => {
    vi.stubEnv('BRAVE_SEARCH_API_KEY', 'env-brave');
    expect(
      defaultImageSearchProviders().map((provider) => provider.origin),
    ).toEqual(['brave']);
  });
});
