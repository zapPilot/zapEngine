// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { TIMINGS } from '@core/constants/timings';
import { useWalletList } from '@core/hooks/wallet/useWalletList';
import type { WalletData } from '@core/lib/validation/walletUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadWallets: vi.fn(),
}));

vi.mock('@core/services', () => ({
  loadWallets: mocks.loadWallets,
}));

const WALLET_A: WalletData = {
  id: 'wallet-a',
  address: '0x1111111111111111111111111111111111111111',
  label: 'A',
  isMain: false,
  isActive: false,
  createdAt: '2026-01-01T00:00:00Z',
  ownershipVerifiedAt: null,
  isVerified: false,
};

const WALLET_B: WalletData = {
  ...WALLET_A,
  id: 'wallet-b',
  address: '0x2222222222222222222222222222222222222222',
  label: 'B',
};

const EMPTY_CONNECTED_WALLETS: [] = [];
const CONNECTED_WALLETS = [
  { address: WALLET_A.address.toUpperCase(), isActive: true },
  { address: WALLET_B.address, isActive: false },
];

describe('useWalletList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.loadWallets.mockReset();
    mocks.loadWallets.mockResolvedValue([WALLET_A, WALLET_B]);
  });

  it('does nothing when loading without a user id', async () => {
    const { result } = renderHook(() =>
      useWalletList({
        userId: undefined,
        connectedWallets: EMPTY_CONNECTED_WALLETS,
        isOpen: true,
        isOwner: true,
      }),
    );

    await act(async () => {
      await result.current.loadWallets();
    });

    expect(mocks.loadWallets).not.toHaveBeenCalled();
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.wallets).toEqual([]);
  });

  it('loads on open and maps connected active state case-insensitively', async () => {
    const { result } = renderHook(() =>
      useWalletList({
        userId: 'user-1',
        connectedWallets: CONNECTED_WALLETS,
        isOpen: true,
        isOwner: false,
      }),
    );

    await waitFor(() =>
      expect(mocks.loadWallets).toHaveBeenCalledWith('user-1'),
    );
    await waitFor(() => expect(result.current.wallets).toHaveLength(2));
    expect(result.current.wallets[0]?.isActive).toBe(true);
    expect(result.current.wallets[1]?.isActive).toBe(false);
    expect(result.current.isRefreshing).toBe(false);
  });

  it('supports silent refresh without entering the refreshing state', async () => {
    const { result } = renderHook(() =>
      useWalletList({
        userId: 'user-1',
        connectedWallets: EMPTY_CONNECTED_WALLETS,
        isOpen: false,
        isOwner: false,
      }),
    );

    await act(async () => {
      await result.current.loadWallets(true);
    });

    expect(mocks.loadWallets).toHaveBeenCalledTimes(1);
    expect(result.current.isRefreshing).toBe(false);
  });

  it('swallows normalized service failures and clears the refreshing state', async () => {
    mocks.loadWallets.mockRejectedValue(new Error('service failure'));
    const { result } = renderHook(() =>
      useWalletList({
        userId: 'user-1',
        connectedWallets: EMPTY_CONNECTED_WALLETS,
        isOpen: false,
        isOwner: false,
      }),
    );

    await act(async () => {
      await result.current.loadWallets();
    });

    expect(result.current.wallets).toEqual([]);
    expect(result.current.isRefreshing).toBe(false);
  });

  it('periodically performs silent owner refreshes and cleans up the interval', async () => {
    let intervalCallback: (() => void) | undefined;
    const realSetInterval = globalThis.setInterval.bind(globalThis);
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation(((
        callback: TimerHandler,
        delay?: number,
        ...args: unknown[]
      ) => {
        if (delay === TIMINGS.WALLET_REFRESH_INTERVAL) {
          intervalCallback = callback as () => void;
          return 123 as unknown as ReturnType<typeof setInterval>;
        }
        return realSetInterval(callback, delay, ...args);
      }) as typeof setInterval);
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = renderHook(() =>
      useWalletList({
        userId: 'user-1',
        connectedWallets: EMPTY_CONNECTED_WALLETS,
        isOpen: true,
        isOwner: true,
      }),
    );

    await waitFor(() => expect(mocks.loadWallets).toHaveBeenCalledTimes(1));
    expect(intervalCallback).toBeDefined();

    await act(async () => {
      intervalCallback?.();
      await Promise.resolve();
    });
    expect(mocks.loadWallets).toHaveBeenCalledTimes(2);

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledWith(123);
    expect(
      setIntervalSpy.mock.calls.some(
        ([, delay]) => delay === TIMINGS.WALLET_REFRESH_INTERVAL,
      ),
    ).toBe(true);
  });

  it('does not create an owner interval when closed, userless, or non-owner', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    const first = renderHook(() =>
      useWalletList({
        userId: 'user-1',
        connectedWallets: EMPTY_CONNECTED_WALLETS,
        isOpen: false,
        isOwner: true,
      }),
    );
    const second = renderHook(() =>
      useWalletList({
        userId: undefined,
        connectedWallets: EMPTY_CONNECTED_WALLETS,
        isOpen: true,
        isOwner: true,
      }),
    );
    const third = renderHook(() =>
      useWalletList({
        userId: 'user-1',
        connectedWallets: EMPTY_CONNECTED_WALLETS,
        isOpen: true,
        isOwner: false,
      }),
    );

    expect(
      setIntervalSpy.mock.calls.some(
        ([, delay]) => delay === TIMINGS.WALLET_REFRESH_INTERVAL,
      ),
    ).toBe(false);
    first.unmount();
    second.unmount();
    third.unmount();
  });
});
