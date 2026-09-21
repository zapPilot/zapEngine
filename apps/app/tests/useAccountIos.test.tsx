// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAccount } from '@/integration/useAccount.ios';

const mocks = vi.hoisted(() => ({
  privy: {
    isReady: true,
    user: null as null | { linked_accounts?: unknown[] },
    logout: vi.fn(),
  },
  login: vi.fn(),
  getUserByWallet: vi.fn(),
  getUserProfile: vi.fn(),
  connectWallet: vi.fn(),
  watchAddress: null as string | null,
  watchListener: null as null | ((address: string | null) => void),
}));

vi.mock('@privy-io/expo', () => ({
  usePrivy: () => mocks.privy,
}));

vi.mock('@privy-io/expo/ui', () => ({
  useLogin: () => ({ login: mocks.login }),
}));

vi.mock('@zapengine/app-core/services/accountService', () => ({
  getUserByWallet: mocks.getUserByWallet,
  getUserProfile: mocks.getUserProfile,
  connectWallet: mocks.connectWallet,
}));

vi.mock('@/integration/iosWatchPortfolioAddress', () => ({
  readIosWatchPortfolioAddress: () => Promise.resolve(mocks.watchAddress),
  subscribeIosWatchPortfolioAddress: (
    listener: (address: string | null) => void,
  ) => {
    mocks.watchListener = listener;
    return () => {
      if (mocks.watchListener === listener) mocks.watchListener = null;
    };
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function profile(userId: string, wallets: string[]) {
  return {
    user: {
      id: userId,
      email: 'reader@example.com',
      is_subscribed_to_reports: false,
      created_at: '2026-09-21T00:00:00Z',
    },
    wallets: wallets.map((wallet, index) => ({
      id: `wallet-${index + 1}`,
      user_id: userId,
      wallet,
      label: index === 0 ? 'Primary' : null,
      ownership_verified_at: null,
      created_at: '2026-09-21T00:00:00Z',
    })),
  };
}

function Capture({
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
  let latest: ReturnType<typeof useAccount> | undefined;
  let root: Root | undefined;

  await act(async () => {
    root = createRoot(container);
    root.render(
      createElement(Capture, {
        onAccount: (value) => {
          latest = value;
        },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  if (!root || !latest) throw new Error('useAccount.ios did not render');

  return {
    get account() {
      if (!latest) throw new Error('useAccount.ios did not render');
      return latest;
    },
    rerender: async () => {
      await act(async () => {
        root?.render(
          createElement(Capture, {
            onAccount: (value) => {
              latest = value;
            },
          }),
        );
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    unmount: async () => {
      await act(async () => root?.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.privy.isReady = true;
  mocks.privy.user = null;
  mocks.watchAddress = null;
  mocks.watchListener = null;
  mocks.login.mockResolvedValue(undefined);
  mocks.privy.logout.mockResolvedValue(undefined);
  mocks.getUserByWallet.mockImplementation(async (address: string) => ({
    user_id:
      address.toLowerCase() === '0x1111111111111111111111111111111111111111'
        ? 'privy-user'
        : 'watch-user',
  }));
  mocks.getUserProfile.mockImplementation(async (userId: string) =>
    profile(
      userId,
      userId === 'privy-user'
        ? ['0x1111111111111111111111111111111111111111']
        : ['0x2222222222222222222222222222222222222222'],
    ),
  );
});

describe('useAccount.ios', () => {
  it('resolves the embedded Privy Ethereum wallet through pure lookup only', async () => {
    mocks.privy.user = {
      linked_accounts: [
        {
          type: 'wallet',
          connector_type: 'embedded',
          chain_type: 'ethereum',
          address: '0x1111111111111111111111111111111111111111',
        },
      ],
    };

    const rendered = await renderAccount();

    expect(rendered.account.address).toBe(
      '0x1111111111111111111111111111111111111111',
    );
    expect(rendered.account.viewingUserId).toBe('privy-user');
    expect(rendered.account.isOwnBundle).toBe(true);
    expect(rendered.account.walletAddresses).toEqual([
      '0x1111111111111111111111111111111111111111',
    ]);
    expect(mocks.getUserByWallet).toHaveBeenCalledWith(
      '0x1111111111111111111111111111111111111111',
    );
    expect(mocks.connectWallet).not.toHaveBeenCalled();

    await rendered.unmount();
  });

  it('falls back to the stored watch address without claiming ownership', async () => {
    mocks.privy.user = { linked_accounts: [] };
    mocks.watchAddress = '0x2222222222222222222222222222222222222222';

    const rendered = await renderAccount();

    expect(rendered.account.address).toBe(
      '0x2222222222222222222222222222222222222222',
    );
    expect(rendered.account.viewingUserId).toBe('watch-user');
    expect(rendered.account.isOwnBundle).toBe(false);
    expect(rendered.account.isDemo).toBe(false);
    expect(mocks.connectWallet).not.toHaveBeenCalled();

    await rendered.unmount();
  });

  it('reacts to a newly saved watch address without bootstrapping an account', async () => {
    mocks.privy.user = { linked_accounts: [] };
    const rendered = await renderAccount();

    await act(async () => {
      mocks.watchListener?.('0x2222222222222222222222222222222222222222');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rendered.account.viewingUserId).toBe('watch-user');
    expect(rendered.account.isOwnBundle).toBe(false);
    expect(mocks.connectWallet).not.toHaveBeenCalled();

    await rendered.unmount();
  });
});
