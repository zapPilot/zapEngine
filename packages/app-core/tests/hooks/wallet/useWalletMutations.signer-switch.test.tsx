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
const OTHER_WALLET = '0x0000000000000000000000000000000000000001';
const VERIFY_SIGNER_ERROR = 'Switch to this wallet before verifying ownership';

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
  mocks.verifyWallet.mockResolvedValue({ success: true });
  mocks.requestWalletBindingChallenge.mockResolvedValue({
    nonce: 'a'.repeat(64),
    message: 'ownership-message',
    expiresAt: '2026-08-23T00:05:00.000Z',
  });
});

describe('useWalletMutations signer switching', () => {
  it('does not open signing after the active signer changes while challenge is pending', async () => {
    let resolveChallenge!: (challenge: {
      nonce: string;
      message: string;
      expiresAt: string;
    }) => void;
    mocks.requestWalletBindingChallenge.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveChallenge = resolve;
        }),
    );
    const signMessage = vi.fn().mockResolvedValue('0xsignature');
    const { result, rerender } = renderHook(
      ({ signingAddress }) => useHarness(signingAddress, signMessage),
      {
        initialProps: { signingAddress: WALLET },
        wrapper: createWrapper(),
      },
    );

    let verification!: Promise<{ success: boolean; error?: string }>;
    await act(async () => {
      verification = result.current.handleVerifyWallet(WALLET);
      await vi.waitFor(() => {
        expect(mocks.requestWalletBindingChallenge).toHaveBeenCalledWith(
          USER_ID,
          WALLET,
        );
      });
    });

    rerender({ signingAddress: OTHER_WALLET });

    await act(async () => {
      resolveChallenge({
        nonce: 'b'.repeat(64),
        message: 'stale-ownership-message',
        expiresAt: '2026-08-23T00:05:00.000Z',
      });
      await expect(verification).resolves.toEqual({
        success: false,
        error: VERIFY_SIGNER_ERROR,
      });
    });

    expect(signMessage).not.toHaveBeenCalled();
    expect(mocks.verifyWallet).not.toHaveBeenCalled();
    expect(mocks.invalidateAndRefetch).not.toHaveBeenCalled();
    expect(mocks.loadWallets).not.toHaveBeenCalled();
    expect(mocks.setWalletOperationState).toHaveBeenLastCalledWith(
      'verifying',
      WALLET,
      {
        isLoading: false,
        error: VERIFY_SIGNER_ERROR,
      },
    );
  });

  it('does not submit a signature after the active signer changes', async () => {
    let resolveSignature!: (signature: string) => void;
    const signMessage = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveSignature = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ signingAddress }) => useHarness(signingAddress, signMessage),
      {
        initialProps: { signingAddress: WALLET },
        wrapper: createWrapper(),
      },
    );

    let verification!: Promise<{ success: boolean; error?: string }>;
    await act(async () => {
      verification = result.current.handleVerifyWallet(WALLET);
      await vi.waitFor(() => {
        expect(signMessage).toHaveBeenCalledWith('ownership-message');
      });
    });

    rerender({ signingAddress: OTHER_WALLET });

    await act(async () => {
      resolveSignature('0xstale-signature');
      await expect(verification).resolves.toEqual({
        success: false,
        error: VERIFY_SIGNER_ERROR,
      });
    });

    expect(mocks.verifyWallet).not.toHaveBeenCalled();
    expect(mocks.invalidateAndRefetch).not.toHaveBeenCalled();
    expect(mocks.loadWallets).not.toHaveBeenCalled();
    expect(mocks.setWalletOperationState).toHaveBeenLastCalledWith(
      'verifying',
      WALLET,
      {
        isLoading: false,
        error: VERIFY_SIGNER_ERROR,
      },
    );
  });
});
