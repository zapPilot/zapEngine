import { expect, it } from 'vitest';
import { podcastEpisodeHref } from '@/integration/podcastRoutes';
it('encodes episode identities and language lanes in one shared route', () => {
  expect(podcastEpisodeHref(' episode / one ', 'zh-Hant')).toBe(
    '/podcast/episode%20%2F%20one?lang=zh-Hant',
  );
  expect(podcastEpisodeHref('id', ' en ')).toBe('/podcast/id?lang=en');
  expect(podcastEpisodeHref('id', '')).toBe('/podcast/id');
  expect(podcastEpisodeHref(' ', 'en')).toBe('/listen');
});

it('links each media destination with or without a language parameter', () => {
  expect(podcastEpisodeHref('id', '', 'video')).toBe('/podcast/id?view=video');
  expect(podcastEpisodeHref('id', 'en', 'transcript')).toBe(
    '/podcast/id?lang=en&view=transcript',
  );
  expect(podcastEpisodeHref('id', 'ja', 'classroom')).toBe(
    '/podcast/id?lang=ja&view=classroom',
  );
  expect(podcastEpisodeHref('', 'en', 'video')).toBe('/listen');
});
