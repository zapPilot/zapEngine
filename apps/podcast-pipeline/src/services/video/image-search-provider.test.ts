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
  it('returns Brave alone and does not revive a retired stock provider from its key', () => {
    const providers = defaultImageSearchProviders({
      BRAVE_SEARCH_API_KEY: 'brave-key',
      PEXELS_API_KEY: 'pexels-key',
      PIXABAY_API_KEY: 'pixabay-key',
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
    ).toThrow('BRAVE_SEARCH_API_KEY');
  });

  it('executes the Brave provider with default and explicit options', async () => {
    searchMocks.brave.mockResolvedValue([]);
    const [brave] = defaultImageSearchProviders({
      BRAVE_SEARCH_API_KEY: 'brave-key',
    });
    const controller = new AbortController();

    await brave!.search('query');
    await brave!.search('query', { count: 7, signal: controller.signal });

    expect(searchMocks.brave.mock.calls).toEqual([
      ['query', 'brave-key', {}],
      ['query', 'brave-key', { count: 7, signal: controller.signal }],
    ]);
  });

  it('uses process env by default', () => {
    vi.stubEnv('BRAVE_SEARCH_API_KEY', 'env-brave');
    expect(
      defaultImageSearchProviders().map((provider) => provider.origin),
    ).toEqual(['brave']);
  });
});
