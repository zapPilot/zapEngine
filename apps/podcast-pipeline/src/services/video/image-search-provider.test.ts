import { afterEach, describe, expect, it, vi } from 'vitest';

const searchMocks = vi.hoisted(() => ({
  bing: vi.fn(),
  pexels: vi.fn(),
  pixabay: vi.fn(),
}));

vi.mock('./bing-image-search.js', () => ({ searchBingImages: searchMocks.bing }));
vi.mock('./pexels-image-search.js', () => ({ searchPexelsImages: searchMocks.pexels }));
vi.mock('./pixabay-image-search.js', () => ({ searchPixabayImages: searchMocks.pixabay }));

import { defaultImageSearchProviders } from './image-search-provider.js';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('defaultImageSearchProviders', () => {
  it('degrades to the zero-config Bing provider when no keys are set', () => {
    const providers = defaultImageSearchProviders({});
    expect(providers.map((provider) => provider.origin)).toEqual(['bing']);
  });

  it('runs license-clean providers before Bing when keys are configured', () => {
    const providers = defaultImageSearchProviders({
      PEXELS_API_KEY: 'pexels-key',
      PIXABAY_API_KEY: 'pixabay-key',
    });
    expect(providers.map((provider) => provider.origin)).toEqual([
      'pexels',
      'pixabay',
      'bing',
    ]);
  });

  it('executes every configured provider with default and explicit options', async () => {
    searchMocks.pexels.mockResolvedValue([]);
    searchMocks.pixabay.mockResolvedValue([]);
    searchMocks.bing.mockResolvedValue([]);
    const providers = defaultImageSearchProviders({
      PEXELS_API_KEY: 'pexels-key',
      PIXABAY_API_KEY: 'pixabay-key',
    });
    const controller = new AbortController();

    await providers[0]!.search('query');
    await providers[1]!.search('query', { count: 7, signal: controller.signal });
    await providers[2]!.search('query');

    expect(searchMocks.pexels).toHaveBeenCalledWith('query', 'pexels-key', {});
    expect(searchMocks.pixabay).toHaveBeenCalledWith('query', 'pixabay-key', {
      count: 7,
      signal: controller.signal,
    });
    expect(searchMocks.bing).toHaveBeenCalledWith('query', {});
  });

  it('uses process env by default', () => {
    vi.stubEnv('PEXELS_API_KEY', 'env-pexels');
    vi.stubEnv('PIXABAY_API_KEY', 'env-pixabay');
    expect(defaultImageSearchProviders().map((provider) => provider.origin)).toEqual([
      'pexels',
      'pixabay',
      'bing',
    ]);
  });

  it('treats blank keys as unconfigured', () => {
    const providers = defaultImageSearchProviders({
      PEXELS_API_KEY: '   ',
      PIXABAY_API_KEY: '',
    });
    expect(providers.map((provider) => provider.origin)).toEqual(['bing']);
  });
});
