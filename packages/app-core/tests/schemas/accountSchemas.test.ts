import { describe, expect, it } from 'vitest';

import {
  validateAddWalletResponse,
  validateMessageResponse,
  validateUserWallets,
} from '../../src/schemas/api/accountSchemas';

describe('account service response schemas', () => {
  it('accepts complete user wallet rows and nullable labels from account-engine', () => {
    expect(
      validateUserWallets([
        {
          id: 'wallet-1',
          user_id: 'user-1',
          wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
          label: null,
          created_at: '2026-07-02T00:00:00.000Z',
        },
      ]),
    ).toEqual([
      {
        id: 'wallet-1',
        user_id: 'user-1',
        wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        label: null,
        created_at: '2026-07-02T00:00:00.000Z',
      },
    ]);
  });

  it('rejects malformed wallet rows before wallet manager consumers read them', () => {
    expect(() =>
      validateUserWallets([
        {
          id: 'wallet-1',
          user_id: 'user-1',
          label: 'Vault',
          created_at: '2026-07-02T00:00:00.000Z',
        },
      ]),
    ).toThrow();
  });

  it('rejects malformed wallet mutation responses instead of treating them as successful', () => {
    expect(() =>
      validateAddWalletResponse({ wallet_id: 'wallet-1' }),
    ).toThrow();
    expect(() => validateMessageResponse({ ok: true })).toThrow();
  });
});
