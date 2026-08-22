import { describe, expect, it } from 'vitest';

import {
  validateConnectWalletResponse,
  validateAddWalletResponse,
  validateMessageResponse,
  validateUserProfileResponse,
  validateUserWallets,
  validateVerifyWalletResponse,
} from '../../src/schemas/api/accountSchemas';

describe('account service response schemas', () => {
  it('accepts wallet-only profiles with a nullable email from account-engine', () => {
    expect(
      validateUserProfileResponse({
        user: {
          id: 'user-1',
          email: null,
          is_subscribed_to_reports: false,
          created_at: '2026-07-02T00:00:00.000Z',
        },
        wallets: [],
      }),
    ).toMatchObject({
      user: {
        id: 'user-1',
        email: null,
      },
      wallets: [],
    });
  });

  it('accepts failed ETL responses when connecting a new wallet', () => {
    expect(
      validateConnectWalletResponse({
        user_id: 'user-1',
        is_new_user: true,
        etl_job: {
          job_id: null,
          status: 'error',
          message: 'Failed to queue ETL job',
          rate_limited: false,
        },
      }),
    ).toEqual({
      user_id: 'user-1',
      is_new_user: true,
      etl_job: {
        job_id: null,
        status: 'error',
        message: 'Failed to queue ETL job',
        rate_limited: false,
      },
    });
  });

  it('accepts complete user wallet rows and nullable labels from account-engine', () => {
    expect(
      validateUserWallets([
        {
          id: 'wallet-1',
          user_id: 'user-1',
          wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
          label: null,
          ownership_verified_at: null,
          created_at: '2026-07-02T00:00:00.000Z',
        },
      ]),
    ).toEqual([
      {
        id: 'wallet-1',
        user_id: 'user-1',
        wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        label: null,
        ownership_verified_at: null,
        created_at: '2026-07-02T00:00:00.000Z',
      },
    ]);
  });

  it('accepts a wallet verification response with its timestamp', () => {
    expect(
      validateVerifyWalletResponse({
        success: true,
        message: 'Wallet ownership verified successfully',
        ownership_verified_at: '2026-08-22T00:00:00.000Z',
      }),
    ).toEqual({
      success: true,
      message: 'Wallet ownership verified successfully',
      ownership_verified_at: '2026-08-22T00:00:00.000Z',
    });
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
