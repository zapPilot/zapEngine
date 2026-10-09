// @vitest-environment jsdom
import { act, cloneElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SideNav } from '@/components/shell/SideNav.web';
const mocks = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue('cancelled'),
  navigate: vi.fn(),
  pathname: '/today',
  connected: false,
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
  'react-native-svg',
  async () => (await import('./support/svgStub')).svgStub,
);
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
    connect: mocks.connect,
    email: 'test@example.com',
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
  mocks.pathname = '/today';
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
    ['Listen', '/listen'],
    ['Runtime', '/runtime'],
    ['Today', '/today'],
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
      .querySelector<HTMLButtonElement>('[aria-label="Manage wallets"]')!
      .click(),
  );
  expect(mocks.navigate).toHaveBeenLastCalledWith(
    'NAVIGATE',
    '/runtime?section=wallet',
  );
});
it('lets guests navigate every place while keeping login in the footer', async () => {
  await act(async () => root.render(<SideNav />));
  await click('Runtime');
  expect(mocks.navigate).toHaveBeenLastCalledWith('NAVIGATE', '/runtime');
  await click('Listen');
  expect(mocks.navigate).toHaveBeenLastCalledWith('NAVIGATE', '/listen');
  expect(mocks.connect).not.toHaveBeenCalled();
  await click('Sign in');
  expect(mocks.connect).toHaveBeenCalledOnce();
});
