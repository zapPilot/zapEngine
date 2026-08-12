import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  usePodcastCatalog,
  usePodcastEpisode,
  usePodcastEpisodeSearch,
  usePodcastEpisodes,
} from '@/integration/podcastFeed';

const mocks = vi.hoisted(() => ({
  language: {
    isHydrated: false,
    languageCode: 'en',
  },
  useQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}));

vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => mocks.language,
}));

function lastQueryOptions(): Record<string, unknown> {
  const options = mocks.useQuery.mock.calls.at(-1)?.[0];
  if (typeof options !== 'object' || options === null) {
    throw new Error('Expected podcast hook to call useQuery with options');
  }
  return options as Record<string, unknown>;
}

describe('podcast feed query hydration', () => {
  beforeEach(() => {
    mocks.useQuery.mockReset();
    mocks.language.isHydrated = false;
    mocks.language.languageCode = 'en';
  });

  it('does not request the language feed until the stored locale hydrates', () => {
    usePodcastEpisodes();
    expect(lastQueryOptions()).toMatchObject({
      queryKey: ['desktop', 'podcast', 'episodes', 'en'],
      enabled: false,
    });

    mocks.language.isHydrated = true;
    mocks.language.languageCode = 'ja';
    usePodcastEpisodes();
    expect(lastQueryOptions()).toMatchObject({
      queryKey: ['desktop', 'podcast', 'episodes', 'ja'],
      enabled: true,
    });
  });

  it('gates detail and search queries on locale hydration', () => {
    usePodcastEpisode('localization-1', 'en');
    expect(lastQueryOptions()['enabled']).toBe(false);

    usePodcastEpisodeSearch('liquidity');
    expect(lastQueryOptions()['enabled']).toBe(false);

    mocks.language.isHydrated = true;
    usePodcastEpisode('localization-1', 'en');
    expect(lastQueryOptions()['enabled']).toBe(true);

    usePodcastEpisodeSearch('liquidity');
    expect(lastQueryOptions()['enabled']).toBe(true);
  });

  it('loads the language-neutral catalog eagerly', () => {
    usePodcastCatalog();

    expect(lastQueryOptions()).toMatchObject({
      queryKey: ['desktop', 'podcast', 'episodes', 'catalog'],
      staleTime: 30 * 60 * 1000,
    });
    expect(lastQueryOptions()).not.toHaveProperty('enabled');
  });
});
