// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useWalletLabels } from '@core/hooks/wallet/useWalletLabels';
import type { WalletData } from '@core/lib/validation/walletUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateManagedWalletLabel: vi.fn(),
  handleWalletError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : 'normalized error',
  ),
}));

vi.mock('@core/services', () => ({
  updateManagedWalletLabel: mocks.updateManagedWalletLabel,
}));

vi.mock('@core/lib/validation/walletUtils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@core/lib/validation/walletUtils')>();
  return {
    ...actual,
    handleWalletError: mocks.handleWalletError,
  };
});

const WALLET: WalletData = {
  id: 'wallet-1',
  address: '0x1111111111111111111111111111111111111111',
  label: 'Old label',
  isMain: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  ownershipVerifiedAt: null,
  isVerified: false,
};

function makeHarness(
  overrides: Partial<Parameters<typeof useWalletLabels>[0]> = {},
) {
  let wallets = overrides.wallets ?? [WALLET];
  const setWallets = vi.fn((updater) => {
    wallets = typeof updater === 'function' ? updater(wallets) : updater;
  });
  const setEditingWallet = vi.fn();
  const setWalletOperationState = vi.fn();

  const params = {
    userId: 'user-1',
    wallets,
    setWallets,
    setEditingWallet,
    setWalletOperationState,
    ...overrides,
  } as Parameters<typeof useWalletLabels>[0];

  const hook = renderHook(() => useWalletLabels(params));
  return {
    ...hook,
    setWallets,
    setEditingWallet,
    setWalletOperationState,
    getWallets: () => wallets,
  };
}

describe('useWalletLabels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateManagedWalletLabel.mockResolvedValue({ success: true });
  });

  it('closes editing without making a request when user id or label is missing', async () => {
    const noUser = makeHarness({ userId: '' });
    await act(async () => {
      await noUser.result.current.handleEditLabel('wallet-1', 'New label');
    });
    expect(noUser.setEditingWallet).toHaveBeenCalledWith(null);

    const blankLabel = makeHarness();
    await act(async () => {
      await blankLabel.result.current.handleEditLabel('wallet-1', '   ');
    });
    expect(blankLabel.setEditingWallet).toHaveBeenCalledWith(null);
    expect(mocks.updateManagedWalletLabel).not.toHaveBeenCalled();
  });

  it('closes editing when the requested wallet is missing', async () => {
    const harness = makeHarness({ wallets: [] });
    await act(async () => {
      await harness.result.current.handleEditLabel('missing', 'New label');
    });

    expect(harness.setEditingWallet).toHaveBeenCalledWith(null);
    expect(harness.setWalletOperationState).not.toHaveBeenCalled();
  });

  it('optimistically updates the label and completes a successful request', async () => {
    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.handleEditLabel('wallet-1', 'New label');
    });

    expect(harness.getWallets()[0]?.label).toBe('New label');
    expect(mocks.updateManagedWalletLabel).toHaveBeenCalledWith(
      'user-1',
      WALLET.address,
      'New label',
    );
    expect(harness.setEditingWallet).toHaveBeenCalledWith(null);
    expect(harness.setWalletOperationState).toHaveBeenNthCalledWith(
      1,
      'editing',
      'wallet-1',
      { isLoading: true, error: null },
    );
    expect(harness.setWalletOperationState).toHaveBeenLastCalledWith(
      'editing',
      'wallet-1',
      { isLoading: false, error: null },
    );
  });

  it('preserves non-target wallets during an optimistic label update', async () => {
    const otherWallet: WalletData = {
      ...WALLET,
      id: 'wallet-2',
      address: '0x2222222222222222222222222222222222222222',
      label: 'Other label',
    };
    const harness = makeHarness({ wallets: [WALLET, otherWallet] });

    await act(async () => {
      await harness.result.current.handleEditLabel('wallet-1', 'New label');
    });

    expect(harness.getWallets()).toEqual([
      { ...WALLET, label: 'New label' },
      otherWallet,
    ]);
  });

  it('rolls back and exposes an API failure message', async () => {
    mocks.updateManagedWalletLabel.mockResolvedValue({
      success: false,
      error: 'rejected by server',
    });
    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.handleEditLabel('wallet-1', 'New label');
    });

    expect(harness.getWallets()[0]?.label).toBe('Old label');
    expect(harness.setWalletOperationState).toHaveBeenLastCalledWith(
      'editing',
      'wallet-1',
      { isLoading: false, error: 'rejected by server' },
    );
  });

  it('uses the default failure message when the API omits one', async () => {
    mocks.updateManagedWalletLabel.mockResolvedValue({ success: false });
    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.handleEditLabel('wallet-1', 'New label');
    });

    expect(harness.setWalletOperationState).toHaveBeenLastCalledWith(
      'editing',
      'wallet-1',
      { isLoading: false, error: 'Failed to update wallet label' },
    );
  });

  it('rolls back and normalizes thrown errors', async () => {
    mocks.updateManagedWalletLabel.mockRejectedValue(new Error('network down'));
    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.handleEditLabel('wallet-1', 'New label');
    });

    expect(harness.getWallets()[0]?.label).toBe('Old label');
    expect(mocks.handleWalletError).toHaveBeenCalledWith(expect.any(Error));
    expect(harness.setWalletOperationState).toHaveBeenLastCalledWith(
      'editing',
      'wallet-1',
      { isLoading: false, error: 'network down' },
    );
  });
});
