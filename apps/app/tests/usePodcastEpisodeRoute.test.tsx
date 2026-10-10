// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { usePodcastEpisodeRoute } from '@/hooks/usePodcastEpisodeRoute';
const state = vi.hoisted(() => ({ params: {} as Record<string, unknown> }));
vi.mock('expo-router', () => ({ useLocalSearchParams: () => state.params }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  state.params = {};
});
async function resolve(view?: string | string[]) {
  state.params = {
    episodeId: 'ep-1',
    lang: 'ja',
    ...(view === undefined ? {} : { view }),
  };
  let value: ReturnType<typeof usePodcastEpisodeRoute> | undefined;
  function Reader() {
    value = usePodcastEpisodeRoute('en');
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Reader />));
  await act(async () => root.unmount());
  return value;
}
it('preserves default media behavior and accepts only supported explicit destinations', async () => {
  expect(await resolve()).toEqual({
    episodeId: 'ep-1',
    languageCode: 'ja',
    mediaTab: undefined,
  });
  for (const mediaTab of ['video', 'transcript', 'classroom'])
    expect((await resolve(mediaTab))?.mediaTab).toBe(mediaTab);
  expect((await resolve(['classroom', 'video']))?.mediaTab).toBe('classroom');
  expect((await resolve('unknown'))?.mediaTab).toBeUndefined();
});
