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
) {
  const [operations, setOperations] = useState<WalletOperations>({
    adding: { isLoading: false, error: null },
    removing: {},
    editing: {},
    verifying: {},
    subscribing: { isLoading: false, error: null },
  });
  const [, setWallets] = useState([]);

  return useWalletMutations({
    userId: USER_ID,
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
  mocks.verifyWallet.mockResolvedValue({ success: true });
  mocks.requestWalletBindingChallenge.mockResolvedValue({
    nonce: 'a'.repeat(64),
    message: 'ownership-message',
    expiresAt: '2026-08-22T00:05:00.000Z',
  });
});

describe('useWalletMutations ownership proof', () => {
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
