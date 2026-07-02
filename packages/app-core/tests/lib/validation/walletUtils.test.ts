import { describe, expect, it } from 'vitest';

import { APIError, NetworkError } from '../../../src/lib/http';
import {
  handleWalletError,
  transformWalletData,
  validateWalletAddress,
} from '../../../src/lib/validation/walletUtils';

describe('wallet validation utilities', () => {
  it('validates Ethereum wallet address shape before wallet operations', () => {
    expect(
      validateWalletAddress('0x742d35Cc6634C0532925a3b844Bc454e4438f44e'),
    ).toBe(true);
    expect(validateWalletAddress('not-a-wallet')).toBe(false);
    expect(validateWalletAddress('0x123')).toBe(false);
  });

  it('normalizes user wallets for the bundle wallet manager without marking read-only rows active', () => {
    expect(
      transformWalletData([
        {
          id: 'wallet-1',
          user_id: 'user-1',
          wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
          label: 'Vault',
          created_at: '2026-07-02T00:00:00.000Z',
          updated_at: '2026-07-02T00:00:00.000Z',
        },
        {
          id: 'wallet-2',
          user_id: 'user-1',
          wallet: '0x0000000000000000000000000000000000000001',
          label: null,
          created_at: '2026-07-02T01:00:00.000Z',
          updated_at: '2026-07-02T01:00:00.000Z',
        },
      ]),
    ).toEqual([
      {
        id: 'wallet-1',
        address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        label: 'Vault',
        isMain: false,
        isActive: false,
        createdAt: '2026-07-02T00:00:00.000Z',
      },
      {
        id: 'wallet-2',
        address: '0x0000000000000000000000000000000000000001',
        label: 'Wallet',
        isMain: false,
        isActive: false,
        createdAt: '2026-07-02T01:00:00.000Z',
      },
    ]);
  });

  it('preserves domain wallet API errors but normalizes generic network errors', () => {
    expect(handleWalletError(new APIError('Wallet already exists', 409))).toBe(
      'Wallet already exists',
    );

    const accountServiceError = new Error('Cannot remove the last wallet');
    accountServiceError.name = 'AccountServiceError';
    expect(handleWalletError(accountServiceError)).toBe(
      'Cannot remove the last wallet',
    );

    expect(handleWalletError(new NetworkError())).toBe(
      'Network connection failed. Please check your internet connection.',
    );
  });
});
