import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addWallet,
  loadWallets,
  removeWallet,
  unsubscribeUserEmail,
  updateManagedWalletLabel,
  updateUserEmailSubscription,
} from '@/services/walletService';

vi.mock('@/lib/validation/walletUtils', () => ({
  transformWalletData: vi.fn((wallets: unknown[]) =>
    wallets.map((wallet: any) => ({
      id: wallet.id,
      address: wallet.wallet,
      label: wallet.label ?? 'Wallet',
      isMain: false,
      isActive: false,
      createdAt: wallet.created_at,
    })),
  ),
}));

vi.mock('@/services/accountService', () => ({
  addWalletToBundle: vi.fn(),
  getUserWallets: vi.fn(),
  removeUserEmail: vi.fn(),
  removeWalletFromBundle: vi.fn(),
  updateUserEmail: vi.fn(),
  updateWalletLabel: vi.fn(),
}));

describe('walletService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and normalizes user wallets', async () => {
    const { getUserWallets } = await import('@/services/accountService');
    const { transformWalletData } =
      await import('@/lib/validation/walletUtils');
    const wallets = [
      {
        id: 'wallet-1',
        wallet: '0x1234567890123456789012345678901234567890',
        label: 'Main',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    vi.mocked(getUserWallets).mockResolvedValue(wallets as any);

    await expect(loadWallets('user-1')).resolves.toEqual([
      {
        id: 'wallet-1',
        address: '0x1234567890123456789012345678901234567890',
        label: 'Main',
        isMain: false,
        isActive: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(getUserWallets).toHaveBeenCalledWith('user-1');
    expect(transformWalletData).toHaveBeenCalledWith(wallets);
  });

  it('returns an empty wallet list when loading fails', async () => {
    const { getUserWallets } = await import('@/services/accountService');
    vi.mocked(getUserWallets).mockRejectedValue(new Error('network down'));

    await expect(loadWallets('user-1')).resolves.toEqual([]);
  });

  it('wraps add wallet requests in a service result', async () => {
    const { addWalletToBundle } = await import('@/services/accountService');
    vi.mocked(addWalletToBundle).mockResolvedValue(undefined as never);

    await expect(addWallet('user-1', '0xabc', 'Savings')).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(addWalletToBundle).toHaveBeenCalledWith(
      'user-1',
      '0xabc',
      'Savings',
    );
  });

  it('returns service result errors from wallet mutations', async () => {
    const { removeWalletFromBundle } =
      await import('@/services/accountService');
    vi.mocked(removeWalletFromBundle).mockRejectedValue(
      new Error('Wallet not found'),
    );

    await expect(removeWallet('user-1', 'wallet-1')).resolves.toEqual({
      success: false,
      error: 'Wallet not found',
    });
  });

  it('forwards wallet label updates', async () => {
    const { updateWalletLabel } = await import('@/services/accountService');
    vi.mocked(updateWalletLabel).mockResolvedValue(undefined as never);

    await expect(
      updateManagedWalletLabel('user-1', '0xabc', 'Cold storage'),
    ).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(updateWalletLabel).toHaveBeenCalledWith(
      'user-1',
      '0xabc',
      'Cold storage',
    );
  });

  it('forwards email subscription updates', async () => {
    const { removeUserEmail, updateUserEmail } =
      await import('@/services/accountService');
    vi.mocked(updateUserEmail).mockResolvedValue(undefined as never);
    vi.mocked(removeUserEmail).mockResolvedValue(undefined as never);

    await updateUserEmailSubscription('user-1', 'owner@example.com');
    await unsubscribeUserEmail('user-1');

    expect(updateUserEmail).toHaveBeenCalledWith('user-1', 'owner@example.com');
    expect(removeUserEmail).toHaveBeenCalledWith('user-1');
  });
});
