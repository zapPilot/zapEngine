// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { accountSessions } from '@/storage/accountSessions';
import { revokeAccountOwnerSession } from '@zapengine/app-core/services/accountAuthService';
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
    userInfo: null as {
      userId: string;
      bundleWallets: string[];
      additionalWallets?: { wallet_address: string; label: string | null }[];
    } | null,
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
  const results: ReturnType<typeof useAccount>[] = [];
  // A fresh callback identity on every pass forces a real re-render, which is
  // what the field-identity assertions below need to observe.
  const element = () =>
    createElement(AccountCapture, {
      onAccount: (value) => {
        results.push(value);
      },
    });
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(container);
    root.render(element());
  });
  if (results.length === 0 || !root) {
    throw new Error('Account hook did not render');
  }
  return {
    results,
    get account() {
      const latest = results.at(-1);
      if (!latest) throw new Error('Account hook did not render');
      return latest;
    },
    rerender: async () => {
      await act(async () => {
        root?.render(element());
      });
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
      await expect(rendered.account.connect()).resolves.toBe('connected');
    });

    expect(mocks.wallet.connect).toHaveBeenCalledTimes(1);
    expect(mocks.user.refetch).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  // Regression: a rejection here reaches every fire-and-forget call site as an
  // unhandled promise rejection (Sentry 7728341048).
  it('resolves as cancelled when the user closes the Privy login UI', async () => {
    mocks.wallet.connect.mockRejectedValue(
      Object.assign(new Error('The login flow was closed'), {
        code: 'login_flow_closed',
      }),
    );
    const rendered = await renderAccount();

    await act(async () => {
      await expect(rendered.account.connect()).resolves.toBe('cancelled');
    });

    await rendered.unmount();
  });

  it('still rejects when the login itself fails', async () => {
    const failure = new Error('network failed');
    mocks.wallet.connect.mockRejectedValue(failure);
    const rendered = await renderAccount();

    await act(async () => {
      await expect(rendered.account.connect()).rejects.toBe(failure);
    });

    await rendered.unmount();
  });

  it('refetches the account record instead of reconnecting an already-connected wallet', async () => {
    mocks.wallet.isConnected = true;
    mocks.wallet.account = { address: '0xabc' };
    const rendered = await renderAccount();

    await act(async () => {
      await expect(rendered.account.connect()).resolves.toBe('connected');
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
      await expect(rendered.account.connect()).resolves.toBe('connected');
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

  it('hands out one identity for the empty bundle across renders', async () => {
    const rendered = await renderAccount();

    await rendered.rerender();

    const [first, second] = rendered.results;
    expect(rendered.results).toHaveLength(2);
    expect(second?.walletAddresses).toBe(first?.walletAddresses);
    expect(second?.walletEntries).toBe(first?.walletEntries);
    expect(second?.walletAddresses).toEqual([]);
    await rendered.unmount();
  });

  it('keeps bundle and label identities stable while the user record does not change', async () => {
    mocks.wallet.isConnected = true;
    mocks.wallet.account = { address: '0xabc' };
    mocks.user.userInfo = {
      userId: 'user-1',
      bundleWallets: ['0xabc', '0xdef'],
      additionalWallets: [{ wallet_address: '0xdef', label: 'Cold storage' }],
    };
    const rendered = await renderAccount();

    await rendered.rerender();

    const [first, second] = rendered.results;
    expect(second?.walletAddresses).toBe(first?.walletAddresses);
    expect(second?.walletEntries).toBe(first?.walletEntries);
    expect(second?.walletEntries).toEqual([
      { address: '0xdef', label: 'Cold storage' },
    ]);
    expect(second?.viewingUserId).toBe('user-1');
    await rendered.unmount();
  });
});

vi.mock('@/storage/accountSessions', () => ({
  accountSessions: {
    get: vi.fn().mockResolvedValue(null),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@zapengine/app-core/services/accountAuthService', () => ({
  revokeAccountOwnerSession: vi.fn(),
}));

it.each([
  null,
  { token: 'owner', expiresAt: '2026-12-01', createdAt: '2026-10-04' },
])(
  'clears and revokes the local session on explicit disconnect (%s)',
  async (session) => {
    mocks.user.userInfo = { userId: 'own', bundleWallets: [] };
    vi.mocked(accountSessions.get).mockResolvedValueOnce(session);
    const rendered = await renderAccount();
    await rendered.account.disconnect();
    expect(accountSessions.clear).toHaveBeenCalledWith('own');
    expect(mocks.wallet.disconnect).toHaveBeenCalledTimes(1);
    if (session)
      expect(revokeAccountOwnerSession).toHaveBeenCalledWith('owner');
    await rendered.unmount();
  },
);
it('disconnects the wallet even when server revocation fails', async () => {
  mocks.user.userInfo = { userId: 'own', bundleWallets: [] };
  vi.mocked(accountSessions.get).mockResolvedValueOnce({
    token: 'owner',
    expiresAt: '2026-12-01',
    createdAt: '2026-10-04',
  });
  vi.mocked(revokeAccountOwnerSession).mockRejectedValueOnce(
    new Error('offline'),
  );
  const rendered = await renderAccount();
  await expect(rendered.account.disconnect()).rejects.toThrow('offline');
  expect(accountSessions.clear).toHaveBeenCalledWith('own');
  expect(mocks.wallet.disconnect).toHaveBeenCalledTimes(1);
  await rendered.unmount();
});
it('disconnects an unresolved account without a session', async () => {
  const rendered = await renderAccount();
  await rendered.account.disconnect();
  expect(accountSessions.get).not.toHaveBeenCalled();
  expect(mocks.wallet.disconnect).toHaveBeenCalledTimes(1);
  await rendered.unmount();
});
