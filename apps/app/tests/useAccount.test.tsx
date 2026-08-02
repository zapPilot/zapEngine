// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAccount } from '../src/integration/useAccount';

const mocks = vi.hoisted(() => ({
  urlUserId: null as string | null,
  wallet: {
    account: null as { address: string } | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    error: null as { message: string } | null,
    isConnected: false,
    isConnecting: false,
  },
  user: {
    connectedWallet: null as string | null,
    error: null as string | null,
    loading: false,
    refetch: vi.fn(),
    userInfo: null as { userId: string; bundleWallets: string[] } | null,
  },
}));

vi.mock('@zapengine/app-core/hooks/queries/wallet/useUser', () => ({
  useUser: () => mocks.user,
}));
vi.mock('@zapengine/app-core/providers/walletContext', () => ({
  useWalletProvider: () => mocks.wallet,
}));
vi.mock('@/integration/bundleViewParam', () => ({
  getBundleViewUserId: () => mocks.urlUserId,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function AccountCapture({
  onAccount,
}: {
  onAccount: (account: ReturnType<typeof useAccount>) => void;
}): ReactElement | null {
  onAccount(useAccount());
  return null;
}

async function renderAccount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | undefined;
  let account: ReturnType<typeof useAccount> | undefined;
  await act(async () => {
    root = createRoot(container);
    root.render(
      createElement(AccountCapture, {
        onAccount: (value) => {
          account = value;
        },
      }),
    );
  });
  if (!account || !root) throw new Error('Account hook did not render');
  return {
    get account() {
      if (!account) throw new Error('Account hook did not render');
      return account;
    },
    unmount: async () => {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.urlUserId = null;
  mocks.wallet.account = null;
  mocks.wallet.connect.mockResolvedValue(undefined);
  mocks.wallet.disconnect.mockResolvedValue(undefined);
  mocks.wallet.error = null;
  mocks.wallet.isConnected = false;
  mocks.wallet.isConnecting = false;
  mocks.user.connectedWallet = null;
  mocks.user.error = null;
  mocks.user.loading = false;
  mocks.user.refetch.mockResolvedValue({ data: null });
  mocks.user.userInfo = null;
});

describe('useAccount', () => {
  it('opens the wallet picker only while disconnected', async () => {
    const rendered = await renderAccount();

    await act(async () => {
      await rendered.account.connect();
    });

    expect(mocks.wallet.connect).toHaveBeenCalledTimes(1);
    expect(mocks.user.refetch).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it('refetches the account record instead of reconnecting an already-connected wallet', async () => {
    mocks.wallet.isConnected = true;
    mocks.wallet.account = { address: '0xabc' };
    const rendered = await renderAccount();

    await act(async () => {
      await rendered.account.connect();
    });

    expect(mocks.wallet.connect).not.toHaveBeenCalled();
    expect(mocks.user.refetch).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it('does nothing when the wallet and account record are already resolved', async () => {
    mocks.wallet.isConnected = true;
    mocks.wallet.account = { address: '0xabc' };
    mocks.user.userInfo = { userId: 'user-1', bundleWallets: ['0xabc'] };
    const rendered = await renderAccount();

    await act(async () => {
      await rendered.account.connect();
    });

    expect(mocks.wallet.connect).not.toHaveBeenCalled();
    expect(mocks.user.refetch).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it('keeps wallet and account errors separate and never falls back to demo', async () => {
    mocks.wallet.isConnected = true;
    mocks.wallet.account = { address: '0xabc' };
    mocks.user.error = 'Account lookup failed';
    const rendered = await renderAccount();

    expect(rendered.account.connectionError).toBeNull();
    expect(rendered.account.userResolutionError).toBe('Account lookup failed');
    expect(rendered.account.isUserResolutionFailed).toBe(true);
    expect(rendered.account.isResolvingViewingUser).toBe(true);
    expect(rendered.account.isDemo).toBe(false);
    await rendered.unmount();
  });

  it('lets a public bundle view through even if own account lookup failed', async () => {
    mocks.urlUserId = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';
    mocks.wallet.isConnected = true;
    mocks.wallet.account = { address: '0xabc' };
    mocks.user.error = 'Account lookup failed';
    const rendered = await renderAccount();

    expect(rendered.account.viewingUserId).toBe(mocks.urlUserId);
    expect(rendered.account.isUserResolutionFailed).toBe(false);
    expect(rendered.account.isDemo).toBe(false);
    await rendered.unmount();
  });
});
