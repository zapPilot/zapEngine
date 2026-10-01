// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { BottomTabBar } from '@/components/shell/BottomTabBar';
import { AppTabBar } from '@/components/shell/AppTabBar';
const mocks = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue('cancelled'),
  accessible: false,
  desktop: false,
}));
vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock(
  'lucide-react-native',
  async () => (await import('./support/lucideStub')).lucideStub,
);
vi.mock('@/components/ui/Tap', async () => ({
  Tap: (await import('./support/reactNativeStub')).reactNativeStub.Pressable,
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return { useContentLanguage: () => ({ t: en }) };
});
vi.mock('@/integration/useTabAccess', () => ({
  useTabAccess: () => ({
    connect: mocks.connect,
    isAccessible: (name: string) =>
      mocks.accessible || name === 'home' || name === 'podcast',
  }),
}));
vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ hasSideNav: mocks.desktop }),
}));
vi.mock('@/components/shell/NowPlayingBarHost', () => ({
  NowPlayingBarHost: () => null,
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
  mocks.accessible = false;
  mocks.desktop = false;
});
async function mount(node: ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}
function props() {
  return {
    state: {
      index: 2,
      routes: ['home', 'strategy', 'podcast', 'account'].map((name) => ({
        key: name,
        name,
      })),
    },
    navigation: {
      emit: vi.fn(() => ({ defaultPrevented: false })),
      navigate: vi.fn(),
    },
  };
}
it('keeps the four labelled tabs and opens login for locked tabs without navigating', async () => {
  const navigation = props();
  const page = await mount(<BottomTabBar {...navigation} />);
  expect(
    page.querySelector('[role="tablist"]')?.getAttribute('aria-label'),
  ).toBe('App tabs');
  expect(page.querySelectorAll('[role="tab"]')).toHaveLength(4);
  expect(
    page.querySelector('[aria-label="Podcast"]')?.getAttribute('aria-selected'),
  ).toBe('true');
  await act(async () =>
    page.querySelector<HTMLButtonElement>('[aria-label="Strategy"]')!.click(),
  );
  expect(mocks.connect).toHaveBeenCalledOnce();
  expect(navigation.navigation.navigate).not.toHaveBeenCalled();
  await act(async () =>
    page.querySelector<HTMLButtonElement>('[aria-label="Home"]')!.click(),
  );
  expect(navigation.navigation.navigate).toHaveBeenCalledWith('home');
});
it('respects prevented navigation and does not navigate again to the selected tab', async () => {
  mocks.accessible = true;
  const navigation = props();
  navigation.navigation.emit.mockReturnValue({ defaultPrevented: true });
  const page = await mount(<BottomTabBar {...navigation} />);
  await act(async () =>
    page.querySelector<HTMLButtonElement>('[aria-label="Home"]')!.click(),
  );
  await act(async () =>
    page.querySelector<HTMLButtonElement>('[aria-label="Podcast"]')!.click(),
  );
  expect(navigation.navigation.navigate).not.toHaveBeenCalled();
});
it('removes the bottom tab list while desktop navigation is present', async () => {
  mocks.desktop = true;
  const page = await mount(<AppTabBar {...props()} />);
  expect(page.querySelector('[role="tablist"]')).toBeNull();
  mocks.desktop = false;
  await act(async () => root!.render(<AppTabBar {...props()} />));
  expect(page.querySelector('[role="tablist"]')).not.toBeNull();
});
