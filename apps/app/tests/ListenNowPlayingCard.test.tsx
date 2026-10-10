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
vi.mock('lucide-react-native', () => ({
  RotateCcw: () => null,
  RotateCw: () => null,
  ChevronDown: () => null,
  Pause: () => null,
  Play: () => null,
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
  NowPlayingBar: ({ controls }: { controls: ReactNode }) => (
    <div>scrubber{controls}</div>
  ),
}));
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock('@/components/ui/IconButton', () => ({
  IconButton: ({
    onPress,
    accessibilityLabel,
  }: {
    onPress: () => void;
    accessibilityLabel: string;
  }) => <button aria-label={accessibilityLabel} onClick={onPress} />,
}));
vi.mock('@/components/ui/Icon', () => ({ Icon: () => null }));
vi.mock('@/components/ui/ActionSheet', () => ({
  ActionSheet: ({
    visible,
    onClose,
    actions,
  }: {
    visible: boolean;
    onClose: () => void;
    actions: { id: string; label: string; onPress: () => void }[];
  }) =>
    visible ? (
      <div role="dialog">
        <button onClick={onClose}>Close</button>
        {actions.map((action) => (
          <button
            key={action.id}
            data-speed={action.id}
            onClick={() => {
              onClose();
              action.onPress();
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    ) : null,
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
  expect(view.host.querySelectorAll('[data-speed]')).toHaveLength(5);
  await act(async () =>
    (
      view.host.querySelector('[data-speed="1.5"]') as HTMLButtonElement
    ).click(),
  );
  expect(state.speed).toHaveBeenCalledWith(1.5);
  expect(view.host.querySelector('[role="dialog"]')).toBeNull();
  expect(state.push.mock.calls).toEqual([
    ['/podcast/ep%2Fone?lang=ja&view=video'],
    ['/podcast/ep%2Fone?lang=ja&view=transcript'],
    ['/podcast/ep%2Fone?lang=ja&view=classroom'],
  ]);
  await view.close();
});

it.each([0.75, 1, 1.25, 1.5, 2])(
  'selects %s from the closed-by-default speed picker',
  async (speed) => {
    state.episode = { localizationId: 'one', languageCode: 'zh-TW' };
    const view = await render();
    expect(view.host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () =>
      Array.from(view.host.querySelectorAll('button'))
        .find((button) => button.textContent === '1.25×')!
        .click(),
    );
    await act(async () =>
      (
        view.host.querySelector(`[data-speed="${speed}"]`) as HTMLButtonElement
      ).click(),
    );
    expect(state.speed).toHaveBeenCalledWith(speed);
    expect(view.host.querySelector('[role="dialog"]')).toBeNull();
    await view.close();
  },
);
