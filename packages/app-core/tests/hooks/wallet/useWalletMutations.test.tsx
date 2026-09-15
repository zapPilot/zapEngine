// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addWallet: vi.fn(),
  removeWallet: vi.fn(),
  requestWalletBindingChallenge: vi.fn(),
  verifyWallet: vi.fn(),
  invalidateAndRefetch: vi.fn(),
  refetch: vi.fn(),
  loadWallets: vi.fn(),
  setWalletOperationState: vi.fn(),
}));

vi.mock('@core/services', () => ({
  addWallet: mocks.addWallet,
  removeWallet: mocks.removeWallet,
  requestWalletBindingChallenge: mocks.requestWalletBindingChallenge,
  verifyWallet: mocks.verifyWallet,
}));

vi.mock('@core/hooks/queries/wallet/useUser', () => ({
  useUser: () => ({ refetch: mocks.refetch }),
}));

vi.mock('@core/hooks/utils/useQueryInvalidation', () => ({
  invalidateAndRefetch: mocks.invalidateAndRefetch,
}));

import { useWalletMutations } from '@core/hooks/wallet/useWalletMutations';
import type { WalletOperations } from '@core/types';

const USER_ID = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';
const WALLET = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function useHarness(
  signingAddress: string | null,
  signMessage: (message: string) => Promise<string>,
  userId = USER_ID,
) {
  const [operations, setOperations] = useState<WalletOperations>({
    adding: { isLoading: false, error: null },
    removing: {},
    editing: {},
    verifying: {},
    subscribing: { isLoading: false, error: null },
  });
  const [, setWallets] = useState([
    {
      id: 'wallet-1',
      address: WALLET,
      label: 'Primary',
      isMain: false,
      isActive: false,
      createdAt: '2026-01-01T00:00:00Z',
      ownershipVerifiedAt: null,
      isVerified: false,
    },
    {
      id: 'wallet-2',
      address: '0x2222222222222222222222222222222222222222',
      label: 'Secondary',
      isMain: false,
      isActive: false,
      createdAt: '2026-01-02T00:00:00Z',
      ownershipVerifiedAt: null,
      isVerified: false,
    },
  ]);

  return useWalletMutations({
    userId,
    operations,
    setOperations,
    setWallets,
    setWalletOperationState: mocks.setWalletOperationState,
    loadWallets: mocks.loadWallets,
    signingAddress,
    signMessage,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.invalidateAndRefetch.mockResolvedValue(undefined);
  mocks.loadWallets.mockResolvedValue(undefined);
  mocks.addWallet.mockResolvedValue({ success: true });
  mocks.removeWallet.mockResolvedValue({ success: true });
  mocks.verifyWallet.mockResolvedValue({ success: true });
  mocks.requestWalletBindingChallenge.mockResolvedValue({
    nonce: 'a'.repeat(64),
    message: 'ownership-message',
    expiresAt: '2026-08-22T00:05:00.000Z',
  });
});

describe('useWalletMutations ownership proof', () => {
  it('deletes a wallet, updates local state, and refreshes queries', async () => {
    const signMessage = vi.fn();
    const { result } = renderHook(() => useHarness(WALLET, signMessage), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleDeleteWallet('wallet-1');
    });

    expect(mocks.removeWallet).toHaveBeenCalledWith(USER_ID, 'wallet-1');
    expect(mocks.invalidateAndRefetch).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['user-wallets', USER_ID],
        operationName: 'wallet removal',
      }),
    );
    expect(mocks.setWalletOperationState).toHaveBeenNthCalledWith(
      1,
      'removing',
      'wallet-1',
      { isLoading: true, error: null },
    );
    expect(mocks.setWalletOperationState).toHaveBeenLastCalledWith(
      'removing',
      'wallet-1',
      { isLoading: false, error: null },
    );
  });

  it('handles delete service failures, thrown failures, and missing users', async () => {
    const signMessage = vi.fn();
    mocks.removeWallet.mockResolvedValueOnce({ success: false });
    const failed = renderHook(() => useHarness(WALLET, signMessage), {
      wrapper: createWrapper(),
    });
    await act(async () => failed.result.current.handleDeleteWallet('wallet-1'));
    expect(mocks.setWalletOperationState).toHaveBeenLastCalledWith(
      'removing',
      'wallet-1',
      { isLoading: false, error: 'Failed to remove wallet' },
    );
    failed.unmount();

    mocks.removeWallet.mockRejectedValueOnce(new Error('delete exploded'));
    const thrown = renderHook(() => useHarness(WALLET, signMessage), {
      wrapper: createWrapper(),
    });
    await act(async () => thrown.result.current.handleDeleteWallet('wallet-2'));
    expect(mocks.setWalletOperationState).toHaveBeenLastCalledWith(
      'removing',
      'wallet-2',
      expect.objectContaining({ isLoading: false }),
    );
    thrown.unmount();

    const missing = renderHook(() => useHarness(WALLET, signMessage, ''), {
      wrapper: createWrapper(),
    });
    mocks.removeWallet.mockClear();
    await act(async () =>
      missing.result.current.handleDeleteWallet('wallet-3'),
    );
    expect(mocks.removeWallet).not.toHaveBeenCalled();
  });

  it('rejects add/verify without a user and invalid wallet input', async () => {
    const signMessage = vi.fn();
    const missing = renderHook(() => useHarness(WALLET, signMessage, ''), {
      wrapper: createWrapper(),
    });
    await expect(
      missing.result.current.handleAddWallet({ address: WALLET, label: 'x' }),
    ).resolves.toEqual({ success: false, error: 'User ID is required' });
    await expect(
      missing.result.current.handleVerifyWallet(WALLET),
    ).resolves.toEqual({
      success: false,
      error: 'User ID is required',
    });
    missing.unmount();

    const normal = renderHook(() => useHarness(WALLET, signMessage), {
      wrapper: createWrapper(),
    });
    await expect(
      normal.result.current.handleAddWallet({ address: 'invalid', label: '' }),
    ).resolves.toMatchObject({ success: false });
    expect(mocks.addWallet).not.toHaveBeenCalled();
  });

  it('uses fallback add/verify errors and normalizes thrown add errors', async () => {
    const signMessage = vi.fn().mockResolvedValue('0xsignature');
    const { result } = renderHook(() => useHarness(WALLET, signMessage), {
      wrapper: createWrapper(),
    });

    mocks.addWallet.mockResolvedValueOnce({ success: false });
    await act(async () => {
      await expect(
        result.current.handleAddWallet({ address: WALLET, label: 'Owned' }),
      ).resolves.toEqual({ success: false, error: 'Failed to add wallet' });
    });

    mocks.addWallet.mockRejectedValueOnce(new Error('add exploded'));
    await act(async () => {
      await expect(
        result.current.handleAddWallet({ address: WALLET, label: 'Owned' }),
      ).resolves.toMatchObject({ success: false });
    });

    mocks.verifyWallet.mockResolvedValueOnce({ success: false });
    await act(async () => {
      await expect(result.current.handleVerifyWallet(WALLET)).resolves.toEqual({
        success: false,
        error: 'Failed to verify wallet',
      });
    });
  });
  it('adds a non-matching address without a signature', async () => {
    const signMessage = vi.fn();
    const { result } = renderHook(
      () =>
        useHarness('0x0000000000000000000000000000000000000001', signMessage),
      { wrapper: createWrapper() },
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.handleAddWallet({
        address: WALLET,
        label: 'Owned wallet',
      });
    });

    expect(outcome).toEqual({ success: true });
    expect(mocks.requestWalletBindingChallenge).not.toHaveBeenCalled();
    expect(signMessage).not.toHaveBeenCalled();
    expect(mocks.addWallet).toHaveBeenCalledWith(
      USER_ID,
      WALLET,
      undefined,
      'Owned wallet',
    );
  });

  it('requests, signs, and verifies an existing bundled wallet', async () => {
    const signMessage = vi.fn().mockResolvedValue('0xsignature');
    const { result } = renderHook(() => useHarness(WALLET, signMessage), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.handleVerifyWallet(WALLET)).resolves.toEqual({
        success: true,
      });
    });

    expect(mocks.requestWalletBindingChallenge).toHaveBeenCalledWith(
      USER_ID,
      WALLET,
    );
    expect(signMessage).toHaveBeenCalledWith('ownership-message');
    expect(mocks.verifyWallet).toHaveBeenCalledWith(
      USER_ID,
      WALLET,
      '0xsignature',
    );
    expect(mocks.invalidateAndRefetch).toHaveBeenCalled();
    expect(mocks.loadWallets).toHaveBeenCalledOnce();
  });

  it('does not submit verification when challenge signing fails', async () => {
    const signMessage = vi
      .fn()
      .mockRejectedValue(new Error('Signature rejected'));
    const { result } = renderHook(() => useHarness(WALLET, signMessage), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.handleVerifyWallet(WALLET)).resolves.toEqual({
        success: false,
        error: 'An unexpected error occurred. Please try again.',
      });
    });

    expect(mocks.requestWalletBindingChallenge).toHaveBeenCalledWith(
      USER_ID,
      WALLET,
    );
    expect(signMessage).toHaveBeenCalledWith('ownership-message');
    expect(mocks.verifyWallet).not.toHaveBeenCalled();
    expect(mocks.invalidateAndRefetch).not.toHaveBeenCalled();
    expect(mocks.loadWallets).not.toHaveBeenCalled();
    expect(mocks.setWalletOperationState).toHaveBeenLastCalledWith(
      'verifying',
      WALLET,
      {
        isLoading: false,
        error: 'An unexpected error occurred. Please try again.',
      },
    );
  });

  it('does not refresh wallet state when verification fails', async () => {
    mocks.verifyWallet.mockResolvedValue({
      success: false,
      error: 'Verification rejected',
    });
    const signMessage = vi.fn().mockResolvedValue('0xsignature');
    const { result } = renderHook(() => useHarness(WALLET, signMessage), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.handleVerifyWallet(WALLET)).resolves.toEqual({
        success: false,
        error: 'Verification rejected',
      });
    });

    expect(mocks.invalidateAndRefetch).not.toHaveBeenCalled();
    expect(mocks.loadWallets).not.toHaveBeenCalled();
    expect(mocks.setWalletOperationState).toHaveBeenLastCalledWith(
      'verifying',
      WALLET,
      {
        isLoading: false,
        error: 'Verification rejected',
      },
    );
  });

  it.each([
    ['query invalidation', 'invalidateAndRefetch'],
    ['wallet reload', 'loadWallets'],
  ] as const)(
    'keeps server verification successful when %s fails',
    async (_label, failingRefresh) => {
      mocks[failingRefresh].mockRejectedValueOnce(new Error('refresh failed'));
      const signMessage = vi.fn().mockResolvedValue('0xsignature');
      const { result } = renderHook(() => useHarness(WALLET, signMessage), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await expect(
          result.current.handleVerifyWallet(WALLET),
        ).resolves.toEqual({
          success: true,
        });
      });

      expect(mocks.invalidateAndRefetch).toHaveBeenCalledOnce();
      expect(mocks.loadWallets).toHaveBeenCalledOnce();
      expect(mocks.setWalletOperationState).toHaveBeenLastCalledWith(
        'verifying',
        WALLET,
        {
          isLoading: false,
          error: null,
        },
      );
    },
  );

  it('keeps server verification successful when all wallet refreshes fail', async () => {
    mocks.invalidateAndRefetch.mockRejectedValueOnce(
      new Error('query refresh failed'),
    );
    mocks.loadWallets.mockRejectedValueOnce(new Error('wallet reload failed'));
    const signMessage = vi.fn().mockResolvedValue('0xsignature');
    const { result } = renderHook(() => useHarness(WALLET, signMessage), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.handleVerifyWallet(WALLET)).resolves.toEqual({
        success: true,
      });
    });

    expect(mocks.invalidateAndRefetch).toHaveBeenCalledOnce();
    expect(mocks.loadWallets).toHaveBeenCalledOnce();
    expect(mocks.verifyWallet).toHaveBeenCalledOnce();
    expect(mocks.setWalletOperationState).toHaveBeenLastCalledWith(
      'verifying',
      WALLET,
      {
        isLoading: false,
        error: null,
      },
    );
  });

  it('adds the active wallet without verifying it', async () => {
    const signMessage = vi.fn().mockResolvedValue('0xsignature');
    const { result } = renderHook(
      () => useHarness(WALLET.toLowerCase(), signMessage),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await expect(
        result.current.handleAddWallet({
          address: WALLET,
          label: 'Owned wallet',
        }),
      ).resolves.toEqual({ success: true });
    });

    expect(mocks.requestWalletBindingChallenge).not.toHaveBeenCalled();
    expect(signMessage).not.toHaveBeenCalled();
    expect(mocks.addWallet).toHaveBeenCalledWith(
      USER_ID,
      WALLET,
      undefined,
      'Owned wallet',
    );
  });

  it('refuses to verify when the active signer is not the target wallet', async () => {
    const signMessage = vi.fn();
    const { result } = renderHook(
      () =>
        useHarness('0x0000000000000000000000000000000000000001', signMessage),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await expect(result.current.handleVerifyWallet(WALLET)).resolves.toEqual({
        success: false,
        error: 'Switch to this wallet before verifying ownership',
      });
    });

    expect(mocks.requestWalletBindingChallenge).not.toHaveBeenCalled();
    expect(signMessage).not.toHaveBeenCalled();
    expect(mocks.verifyWallet).not.toHaveBeenCalled();
  });
});
