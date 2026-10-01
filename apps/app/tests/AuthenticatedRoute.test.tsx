// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { AuthenticatedActionProvider } from '@/providers/AuthenticatedActionProvider';
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  connect: vi.fn().mockResolvedValue('connected'),
  retry: vi.fn(),
  account: {
    isConnected: false,
    isConnecting: false,
    isUserResolutionFailed: false,
    viewingUserId: null as string | null,
    loadingUser: false,
  },
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useUnstableGlobalHref: () => '/wallets?source=portfolio',
}));
vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock('@/integration/useAccount', () => ({
  useAccount: () => ({
    ...mocks.account,
    connect: mocks.connect,
    retryUserResolution: mocks.retry,
  }),
}));
vi.mock('@/components/connect/ConnectGatePage', () => ({
  ConnectGatePage: ({ onConnect }: { onConnect: () => void }) => (
    <button type="button" onClick={onConnect}>
      Sign in
    </button>
  ),
}));
vi.mock('@/components/home/DemoConnectOverlay', () => ({
  AccountUnavailableCard: ({ onRetry }: { onRetry: () => void }) => (
    <button type="button" onClick={onRetry}>
      Retry account
    </button>
  ),
}));
vi.mock('@/components/ui/ScreenScrollView', () => ({
  ScreenScrollView: ({ children }: { children: ReactNode }) => children,
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
  Object.assign(mocks.account, {
    isConnected: false,
    isConnecting: false,
    isUserResolutionFailed: false,
    viewingUserId: null,
  });
});
async function mount(node: ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}
it('waits for actual authentication before resuming the original deep link including its query', async () => {
  const node = (
    <AuthenticatedActionProvider>
      <AuthenticatedRoute>Wallets content</AuthenticatedRoute>
    </AuthenticatedActionProvider>
  );
  const page = await mount(node);
  await act(async () => page.querySelector('button')!.click());
  expect(mocks.connect).toHaveBeenCalledOnce();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(page.textContent).not.toContain('Wallets content');
  mocks.account.isConnected = true;
  await act(async () =>
    root!.render(
      <AuthenticatedActionProvider>
        <AuthenticatedRoute>Wallets content</AuthenticatedRoute>
      </AuthenticatedActionProvider>,
    ),
  );
  expect(mocks.replace).toHaveBeenCalledWith('/wallets?source=portfolio');
  expect(page.textContent).toContain('Wallets content');
});
it('allows public bundle views and offers retry when the signed-in account cannot resolve', async () => {
  mocks.account.viewingUserId = 'public-user';
  const page = await mount(
    <AuthenticatedActionProvider>
      <AuthenticatedRoute allowBundleView>Public portfolio</AuthenticatedRoute>
    </AuthenticatedActionProvider>,
  );
  expect(page.textContent).toContain('Public portfolio');
  Object.assign(mocks.account, {
    viewingUserId: null,
    isConnected: true,
    isUserResolutionFailed: true,
  });
  await act(async () =>
    root!.render(
      <AuthenticatedActionProvider>
        <AuthenticatedRoute>Private portfolio</AuthenticatedRoute>
      </AuthenticatedActionProvider>,
    ),
  );
  expect(page.textContent).not.toContain('Private portfolio');
  await act(async () => page.querySelector('button')!.click());
  expect(mocks.retry).toHaveBeenCalledOnce();
});
