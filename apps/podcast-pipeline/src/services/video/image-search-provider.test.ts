import { describe, expect, it } from 'vitest';

import { defaultImageSearchProviders } from './image-search-provider.js';

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

  it('treats blank keys as unconfigured', () => {
    const providers = defaultImageSearchProviders({
      PEXELS_API_KEY: '   ',
      PIXABAY_API_KEY: '',
    });
    expect(providers.map((provider) => provider.origin)).toEqual(['bing']);
  });
});
