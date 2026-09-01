import { afterEach, describe, expect, it, vi } from 'vitest';

const searchMocks = vi.hoisted(() => ({
  brave: vi.fn(),
  pexels: vi.fn(),
  pixabay: vi.fn(),
}));

vi.mock('./brave-image-search.js', () => ({
  BRAVE_MAX_RESULT_COUNT: 100,
  searchBraveImages: searchMocks.brave,
}));
vi.mock('./pexels-image-search.js', () => ({
  PEXELS_MAX_RESULT_COUNT: 80,
  searchPexelsImages: searchMocks.pexels,
}));
vi.mock('./pixabay-image-search.js', () => ({
  PIXABAY_MAX_RESULT_COUNT: 200,
  searchPixabayImages: searchMocks.pixabay,
}));

import { defaultImageSearchProviders } from './image-search-provider.js';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('defaultImageSearchProviders', () => {
  it('runs Brave first and the license-clean stock APIs behind it', () => {
    const providers = defaultImageSearchProviders({
      BRAVE_SEARCH_API_KEY: 'brave-key',
      PEXELS_API_KEY: 'pexels-key',
      PIXABAY_API_KEY: 'pixabay-key',
    });
    expect(
      providers.map((provider) => [provider.origin, provider.maxResults]),
    ).toEqual([
      ['brave', 100],
      ['pexels', 80],
      ['pixabay', 200],
    ]);
  });

  it('fails closed without a Brave key instead of degrading to stock imagery', () => {
    expect(() => defaultImageSearchProviders({})).toThrow(
      'Missing required environment variable: BRAVE_SEARCH_API_KEY',
    );
    expect(() =>
      defaultImageSearchProviders({ BRAVE_SEARCH_API_KEY: '   ' }),
    ).toThrow('BRAVE_SEARCH_API_KEY');
  });

  it('executes every configured provider with default and explicit options', async () => {
    searchMocks.brave.mockResolvedValue([]);
    searchMocks.pexels.mockResolvedValue([]);
    searchMocks.pixabay.mockResolvedValue([]);
    const providers = defaultImageSearchProviders({
      BRAVE_SEARCH_API_KEY: 'brave-key',
      PEXELS_API_KEY: 'pexels-key',
      PIXABAY_API_KEY: 'pixabay-key',
    });
    const controller = new AbortController();

    await providers[0]!.search('query');
    await providers[1]!.search('query', {
      count: 7,
      signal: controller.signal,
    });
    await providers[2]!.search('query');

    expect(searchMocks.brave).toHaveBeenCalledWith('query', 'brave-key', {});
    expect(searchMocks.pexels).toHaveBeenCalledWith('query', 'pexels-key', {
      count: 7,
      signal: controller.signal,
    });
    expect(searchMocks.pixabay).toHaveBeenCalledWith(
      'query',
      'pixabay-key',
      {},
    );
  });

  it('uses process env by default', () => {
    vi.stubEnv('BRAVE_SEARCH_API_KEY', 'env-brave');
    vi.stubEnv('PEXELS_API_KEY', 'env-pexels');
    vi.stubEnv('PIXABAY_API_KEY', 'env-pixabay');
    expect(
      defaultImageSearchProviders().map((provider) => provider.origin),
    ).toEqual(['brave', 'pexels', 'pixabay']);
  });

  it('treats blank stock keys as unconfigured', () => {
    const providers = defaultImageSearchProviders({
      BRAVE_SEARCH_API_KEY: 'brave-key',
      PEXELS_API_KEY: '   ',
      PIXABAY_API_KEY: '',
    });
    expect(providers.map((provider) => provider.origin)).toEqual(['brave']);
  });
});
