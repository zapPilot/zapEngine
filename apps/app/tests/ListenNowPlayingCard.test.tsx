// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ListenNowPlayingCard } from '@/components/listen/ListenNowPlayingCard';
const state = vi.hoisted(() => ({
  episode: null as { localizationId: string; languageCode: string } | null,
  seek: vi.fn(),
  speed: vi.fn(),
  push: vi.fn(),
}));
vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock('@/providers/PodcastPlayerProvider', () => ({
  usePodcastPlayer: () => ({
    nowPlaying: state.episode,
    speed: 1.25,
    seekRelative: state.seek,
    setSpeed: state.speed,
  }),
}));
vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return { useContentLanguage: () => ({ t: en }) };
});
vi.mock('@/components/podcast/NowPlayingBar', () => ({
  NowPlayingBar: () => <div>scrubber</div>,
}));
vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onPress,
  }: {
    children: ReactNode;
    onPress: () => void;
  }) => <button onClick={onPress}>{children}</button>,
}));
vi.mock('@/components/ui/SegmentedControl', () => ({
  SegmentedControl: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => <button onClick={() => onChange('1.5')}>{value}×</button>,
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  state.episode = null;
  vi.clearAllMocks();
});
async function render() {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<ListenNowPlayingCard />));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
    },
  };
}
it('hides the playback card when no episode is loaded', async () => {
  const view = await render();
  expect(view.host.textContent).toBe('');
  await view.close();
});
it('uses section-local controls and sends each media chip to the loaded localization', async () => {
  state.episode = { localizationId: 'ep/one', languageCode: 'ja' };
  const view = await render();
  const buttons = Array.from(view.host.querySelectorAll('button'));
  for (const button of buttons) await act(async () => button.click());
  expect(state.seek.mock.calls).toEqual([[-15], [30]]);
  expect(state.speed).toHaveBeenCalledWith(1.5);
  expect(state.push.mock.calls).toEqual([
    ['/podcast/ep%2Fone?lang=ja&view=video'],
    ['/podcast/ep%2Fone?lang=ja&view=transcript'],
    ['/podcast/ep%2Fone?lang=ja&view=classroom'],
  ]);
  await view.close();
});
