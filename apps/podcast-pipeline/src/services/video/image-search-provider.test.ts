import { afterEach, describe, expect, it, vi } from 'vitest';

const searchMocks = vi.hoisted(() => ({
  brave: vi.fn(),
}));

vi.mock('./brave-image-search.js', () => ({
  BRAVE_MAX_RESULT_COUNT: 100,
  searchBraveImages: searchMocks.brave,
}));

import { defaultImageSearchProviders } from './image-search-provider.js';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('defaultImageSearchProviders', () => {
  it('returns Brave as the only configured external provider', () => {
    const providers = defaultImageSearchProviders({
      BRAVE_SEARCH_API_KEY: 'brave-key',
      PEXELS_API_KEY: 'retired-pexels-key',
      PIXABAY_API_KEY: 'retired-pixabay-key',
    });

    expect(
      providers.map((provider) => [provider.origin, provider.maxResults]),
    ).toEqual([['brave', 100]]);
  });

  it('fails closed without a Brave key', () => {
    expect(() => defaultImageSearchProviders({})).toThrow(
      'Missing required environment variable: BRAVE_SEARCH_API_KEY',
    );
    expect(() =>
      defaultImageSearchProviders({ BRAVE_SEARCH_API_KEY: '   ' }),
    ).toThrow('BRAVE_SEARCH_API_KEY');
  });

  it('executes Brave with default and explicit options', async () => {
    searchMocks.brave.mockResolvedValue([]);
    const providers = defaultImageSearchProviders({
      BRAVE_SEARCH_API_KEY: 'brave-key',
    });
    const provider = providers[0]!;
    const controller = new AbortController();

    await provider.search('query');
    await provider.search('query', {
      count: 7,
      signal: controller.signal,
    });

    expect(searchMocks.brave).toHaveBeenNthCalledWith(
      1,
      'query',
      'brave-key',
      {},
    );
    expect(searchMocks.brave).toHaveBeenNthCalledWith(2, 'query', 'brave-key', {
      count: 7,
      signal: controller.signal,
    });
  });

  it('uses process env by default and ignores retired stock keys', () => {
    vi.stubEnv('BRAVE_SEARCH_API_KEY', 'env-brave');
    vi.stubEnv('PEXELS_API_KEY', 'env-pexels');
    vi.stubEnv('PIXABAY_API_KEY', 'env-pixabay');

    expect(
      defaultImageSearchProviders().map((provider) => provider.origin),
    ).toEqual(['brave']);
  });
});
