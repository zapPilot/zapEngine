// @vitest-environment jsdom
import { act, cloneElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SideNav } from '@/components/shell/SideNav.web';
const mocks = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue('cancelled'),
  navigate: vi.fn(),
  pathname: '/home',
  connected: false,
}));
vi.mock('react-native', async () => ({
  ...(await import('./support/reactNativeStub')).reactNativeStub,
  // Like RN Web, Pressable responds to onPress rather than an injected onClick.
  Pressable: (props: {
    children?: ReactElement;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    onPress?: () => void;
    'aria-current'?: 'page';
  }) => (
    <button
      aria-label={props.accessibilityLabel}
      role={props.accessibilityRole}
      aria-current={props['aria-current']}
      onClick={props.onPress}
    >
      {props.children}
    </button>
  ),
}));
vi.mock(
  'lucide-react-native',
  async () => (await import('./support/lucideStub')).lucideStub,
);
vi.mock('@/components/ui/Tap', async () => import('@/components/ui/Tap.web'));
vi.mock('expo-router', () => ({
  usePathname: () => mocks.pathname,
  Link: ({
    children,
    href,
    dismissTo,
  }: {
    children: ReactElement<{ onClick?: () => void; onPress?: () => void }>;
    href: string;
    dismissTo?: boolean;
  }) =>
    cloneElement(children, {
      // Expo Router supplies onPress in link props as well as web onClick.
      onPress: () => {
        mocks.navigate(dismissTo ? 'POP_TO' : 'NAVIGATE', href);
        mocks.pathname = href;
      },
      onClick: () => {
        mocks.navigate(dismissTo ? 'POP_TO' : 'NAVIGATE', href);
        mocks.pathname = href;
      },
    }),
}));
vi.mock('@/components/ui/BrandLockup', () => ({ BrandLockup: () => null }));
vi.mock('@/components/shell/NowPlayingBarHost', () => ({
  NowPlayingBarHost: () => null,
}));
vi.mock('@/integration/useAccount', () => ({
  useAccount: () => ({
    isConnected: mocks.connected,
    email: 'test@example.com',
  }),
}));
vi.mock('@/integration/useTabAccess', () => ({
  useTabAccess: () => ({
    connect: mocks.connect,
    isAccessible: (name: string) =>
      mocks.connected || name === 'home' || name === 'podcast',
  }),
}));
vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return { useContentLanguage: () => ({ t: en }) };
});
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement('div');
let root = createRoot(host);
afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(host);
  mocks.pathname = '/home';
  mocks.connected = false;
  vi.clearAllMocks();
});
async function click(label: string) {
  await act(async () =>
    host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click(),
  );
  await act(async () => root.render(<SideNav />));
}
it('uses normal navigation for all accessible tabs and the account footer, with URL-driven selection', async () => {
  mocks.connected = true;
  await act(async () => root.render(<SideNav />));
  for (const [label, path] of [
    ['Podcast', '/podcast'],
    ['Strategy', '/strategy'],
    ['Account', '/account'],
    ['Home', '/home'],
  ]) {
    await click(label!);
    expect(mocks.navigate).toHaveBeenLastCalledWith('NAVIGATE', path);
    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(
      host
        .querySelector(`[aria-label="${label}"]`)
        ?.getAttribute('aria-current'),
    ).toBe('page');
  }
  await act(async () =>
    host
      .querySelectorAll<HTMLButtonElement>('[aria-label="Account"]')[1]!
      .click(),
  );
  expect(mocks.navigate).toHaveBeenLastCalledWith('NAVIGATE', '/account');
});
it('requests connection for locked Strategy and Account without navigating', async () => {
  await act(async () => root.render(<SideNav />));
  await click('Strategy');
  await click('Account');
  expect(mocks.connect).toHaveBeenCalledTimes(2);
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(
    host.querySelector('[aria-label="Home"]')?.getAttribute('aria-current'),
  ).toBe('page');
});
