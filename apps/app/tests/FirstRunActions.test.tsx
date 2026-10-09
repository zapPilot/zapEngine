// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { FirstRunActions as WebActions } from '@/components/firstRun/FirstRunActions.web';
import { FirstRunActions as NativeActions } from '@/components/firstRun/FirstRunActions';
const state = vi.hoisted(() => ({
  seen: vi.fn(),
  email: vi.fn(),
  wallet: vi.fn(),
  explore: vi.fn(),
  native: vi.fn(),
}));
vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock('@zapengine/app-core/providers/WalletProvider', () => ({
  useWalletLogin: () => ({
    isConnecting: false,
    connectPrivy: state.email,
    openPicker: state.wallet,
  }),
}));
vi.mock('@/integration/useAccount', () => ({
  useAccount: () => ({ isConnecting: false, connect: state.native }),
}));
vi.mock('@/storage/firstRunStorage', () => ({ markFirstRunSeen: state.seen }));
vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return { useContentLanguage: () => ({ t: en }) };
});
vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onPress,
  }: {
    children: ReactNode;
    onPress: () => void;
  }) => <button onClick={onPress}>{children}</button>,
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());
async function render(native = false) {
  state.seen.mockResolvedValue(undefined);
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      native ? (
        <NativeActions onExplore={state.explore} />
      ) : (
        <WebActions onExplore={state.explore} />
      ),
    ),
  );
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
    },
  };
}
it('persists the flag before opening either web login method or exploring', async () => {
  const view = await render();
  let saved = false;
  state.seen.mockImplementation(async () => {
    saved = true;
  });
  state.email.mockImplementation(async () => {
    expect(saved).toBe(true);
  });
  state.wallet.mockImplementation(() => {
    expect(saved).toBe(true);
  });
  for (const button of view.host.querySelectorAll('button')) {
    saved = false;
    await act(async () => button.click());
  }
  expect(state.seen).toHaveBeenCalledTimes(3);
  expect(state.email).toHaveBeenCalledOnce();
  expect(state.wallet).toHaveBeenCalledOnce();
  expect(state.explore).toHaveBeenCalledOnce();
  await view.close();
});
it('offers email and exploration on Android and contains login rejection', async () => {
  const view = await render(true);
  expect(view.host.textContent).not.toContain('Connect a wallet');
  state.native.mockRejectedValue(new Error('cancelled provider'));
  await act(async () => view.host.querySelector('button')!.click());
  expect(view.host.textContent).toContain('Could not connect');
  expect(state.seen).toHaveBeenCalledOnce();
  await view.close();
});
it('contains web provider failures while preserving the seen flag', async () => {
  const view = await render();
  state.email.mockRejectedValue(new Error('provider unavailable'));
  await act(async () => view.host.querySelector('button')!.click());
  expect(view.host.textContent).toContain('Could not connect');
  expect(state.seen).toHaveBeenCalledOnce();
  await view.close();
});
