import { beforeEach, describe, expect, it, vi } from 'vitest';

const accountApi = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../../src/lib/http', () => ({
  httpUtils: {
    accountApi,
  },
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const { verifyWalletOwnership } = await import('../../src/services/accountService');

const verifyWallet = () =>
  verifyWalletOwnership('user-1', '0xabc', '0xsignature');

describe('accountService wallet verification response validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a verification response that omits the ownership timestamp', async () => {
    accountApi.post.mockResolvedValue({
      success: true,
      message: 'Wallet ownership verified successfully',
    });

    await expect(verifyWallet()).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: 'invalid_type',
          path: ['ownership_verified_at'],
        }),
      ],
    });

    expect(accountApi.post).toHaveBeenCalledWith(
      '/users/user-1/wallets/0xabc/verify',
      { signature: '0xsignature' },
    );
  });

  it('rejects a nominally successful response with a null ownership timestamp', async () => {
    accountApi.post.mockResolvedValue({
      success: true,
      message: 'Wallet ownership verified successfully',
      ownership_verified_at: null,
    });

    await expect(verifyWallet()).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: 'invalid_type',
          path: ['ownership_verified_at'],
        }),
      ],
    });
  });

  it.each(['', 'not-a-date'])(
    'rejects an invalid ownership timestamp %j',
    async (ownershipVerifiedAt) => {
      accountApi.post.mockResolvedValue({
        success: true,
        message: 'Wallet ownership verified successfully',
        ownership_verified_at: ownershipVerifiedAt,
      });

      await expect(verifyWallet()).rejects.toMatchObject({
        issues: [
          expect.objectContaining({
            path: ['ownership_verified_at'],
          }),
        ],
      });
    },
  );

  it('rejects a shape-valid response that reports verification failure', async () => {
    accountApi.post.mockResolvedValue({
      success: false,
      message: 'Wallet ownership verification failed',
      ownership_verified_at: '2026-08-22T13:45:12.345Z',
    });

    await expect(verifyWallet()).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          path: ['success'],
        }),
      ],
    });
  });

  it('returns the verified ownership timestamp without rewriting it', async () => {
    const ownershipVerifiedAt = '2026-08-22T13:45:12.345+00:00';
    accountApi.post.mockResolvedValue({
      success: true,
      message: 'Wallet ownership already verified',
      ownership_verified_at: ownershipVerifiedAt,
    });

    await expect(verifyWallet()).resolves.toEqual({
      success: true,
      message: 'Wallet ownership already verified',
      ownership_verified_at: ownershipVerifiedAt,
    });
  });
});
