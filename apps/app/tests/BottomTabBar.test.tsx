// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { BottomTabBar } from '@/components/shell/BottomTabBar';
import { AppTabBar } from '@/components/shell/AppTabBar';
const mocks = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue('cancelled'),
  desktop: false,
}));
vi.mock('@/providers/FundFlowProvider', () => ({
  useFundFlow: () => ({
    available: true,
    visible: false,
    step: 'amount',
    signRequest: null,
    open: vi.fn(),
    close: vi.fn(),
  }),
}));
vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock(
  'react-native-svg',
  async () => (await import('./support/svgStub')).svgStub,
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
      index: 1,
      routes: ['today', 'listen', 'runtime'].map((name) => ({
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
it('offers all three places to guests and emits navigation events', async () => {
  const navigation = props();
  const page = await mount(<BottomTabBar {...navigation} />);
  expect(
    page.querySelector('[role="tablist"]')?.getAttribute('aria-label'),
  ).toBe('App tabs');
  expect(page.querySelectorAll('[role="tab"]')).toHaveLength(3);
  expect(
    page.querySelector('[aria-label="Listen"]')?.getAttribute('aria-selected'),
  ).toBe('true');
  for (const [label, name] of [
    ['Runtime', 'runtime'],
    ['Today', 'today'],
  ]) {
    await act(async () =>
      page.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click(),
    );
    expect(navigation.navigation.navigate).toHaveBeenLastCalledWith(name);
  }
  expect(mocks.connect).not.toHaveBeenCalled();
});
it('respects prevented navigation and does not navigate again to the selected tab', async () => {
  const navigation = props();
  navigation.navigation.emit.mockReturnValue({ defaultPrevented: true });
  const page = await mount(<BottomTabBar {...navigation} />);
  await act(async () =>
    page.querySelector<HTMLButtonElement>('[aria-label="Today"]')!.click(),
  );
  await act(async () =>
    page.querySelector<HTMLButtonElement>('[aria-label="Listen"]')!.click(),
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
