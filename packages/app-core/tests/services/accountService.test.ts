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

const {
  AccountServiceError,
  addWalletToBundle,
  deleteUser,
  removeWalletFromBundle,
  requestAccountDeletionChallenge,
  requestWalletBindingChallenge,
  triggerWalletDataFetch,
  unsubscribeFromReportsWithToken,
  verifyWalletOwnership,
} = await import('../../src/services/accountService');

describe('accountService wallet verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('omits the signature key when adding an unverified wallet', async () => {
    accountApi.post.mockResolvedValue({
      wallet_id: 'wallet-1',
      message: 'Wallet added',
      ownership_verified: false,
    });

    await expect(
      addWalletToBundle(
        'user-1',
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        undefined,
        'Watch wallet',
      ),
    ).resolves.toMatchObject({ ownership_verified: false });
    expect(accountApi.post).toHaveBeenCalledWith('/users/user-1/wallets', {
      label: 'Watch wallet',
      wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    });
  });

  it('posts a signature to the wallet verify endpoint', async () => {
    accountApi.post.mockResolvedValue({
      success: true,
      message: 'Wallet ownership verified successfully',
      ownership_verified_at: '2026-08-22T00:00:00.000Z',
    });

    await expect(
      verifyWalletOwnership('user-1', '0xabc', '0xsignature'),
    ).resolves.toMatchObject({ success: true });
    expect(accountApi.post).toHaveBeenCalledWith(
      '/users/user-1/wallets/0xabc/verify',
      { signature: '0xsignature' },
    );
  });
});

describe('accountService wallet fetch trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts rate-limited trigger responses with a null job id', async () => {
    const response = {
      job_id: null,
      message: 'Wallet fetch already queued recently.',
      rate_limited: true,
      status: 'pending',
    };

    accountApi.post.mockResolvedValue(response);

    await expect(
      triggerWalletDataFetch(
        'user-1',
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      ),
    ).resolves.toEqual(response);
    expect(accountApi.post).toHaveBeenCalledWith(
      '/users/user-1/wallets/0x742d35Cc6634C0532925a3b844Bc454e4438f44e/fetch-data',
    );
  });

  it('rejects malformed trigger responses instead of treating them as successful', async () => {
    accountApi.post.mockResolvedValue({ job_id: 'job-1', status: 'pending' });

    await expect(
      triggerWalletDataFetch(
        'user-1',
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      ),
    ).rejects.toBeInstanceOf(AccountServiceError);
  });
});

describe('accountService report unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts the signed token to the public unsubscribe endpoint', async () => {
    accountApi.post.mockResolvedValue({
      success: true,
      message: 'Successfully unsubscribed from email reports',
    });

    await expect(
      unsubscribeFromReportsWithToken('signed-token'),
    ).resolves.toEqual({
      success: true,
      message: 'Successfully unsubscribed from email reports',
    });
    expect(accountApi.post).toHaveBeenCalledWith('/users/reports/unsubscribe', {
      token: 'signed-token',
    });
  });
});

describe('accountService ownership challenges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const challenge = {
    nonce: 'a'.repeat(64),
    message: 'Sign this purpose-separated message',
    expiresAt: '2026-08-22T00:05:00.000Z',
  };

  it('requests a wallet-binding challenge for the target address', async () => {
    accountApi.post.mockResolvedValue(challenge);

    await expect(
      requestWalletBindingChallenge('user-1', '0xabc'),
    ).resolves.toEqual(challenge);
    expect(accountApi.post).toHaveBeenCalledWith(
      '/users/user-1/wallets/challenge',
      { wallet: '0xabc' },
    );
  });

  it('signs account deletion through the dedicated endpoint and body', async () => {
    accountApi.post.mockResolvedValue(challenge);
    await expect(
      requestAccountDeletionChallenge('user-1', '0xabc'),
    ).resolves.toEqual(challenge);

    accountApi.delete.mockResolvedValue({
      success: true,
      message: 'User deleted successfully',
    });
    await expect(
      deleteUser('user-1', '0xabc', '0xsignature'),
    ).resolves.toMatchObject({ success: true });
    expect(accountApi.delete).toHaveBeenCalledWith('/users/user-1', {
      wallet: '0xabc',
      signature: '0xsignature',
    });
  });
});

describe('accountService wallet bundle errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves unauthorized wallet bundle failures as AccountServiceError details', async () => {
    accountApi.post.mockRejectedValue({
      code: 'UNAUTHORIZED',
      response: {
        data: { message: 'Unauthorized wallet bundle access.' },
        status: 401,
      },
    });

    await expect(
      addWalletToBundle(
        'user-1',
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        '0xsignature',
        'Primary wallet',
      ),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Unauthorized wallet bundle access.',
      status: 401,
    });

    expect(accountApi.post).toHaveBeenCalledWith('/users/user-1/wallets', {
      label: 'Primary wallet',
      signature: '0xsignature',
      wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    });
  });

  it('maps duplicate wallet conflicts to the user-facing bundle message', async () => {
    accountApi.post.mockRejectedValue({
      response: {
        data: { message: 'wallet already exists in this bundle' },
        status: 409,
      },
    });

    await expect(
      addWalletToBundle(
        'user-1',
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        '0xsignature',
        'Primary wallet',
      ),
    ).rejects.toMatchObject({
      message: 'This wallet is already associated with an account.',
      status: 409,
    });

    expect(accountApi.post).toHaveBeenCalledWith('/users/user-1/wallets', {
      label: 'Primary wallet',
      signature: '0xsignature',
      wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    });
  });

  it('preserves wallet bundle rate-limit failures for retry-aware UI handling', async () => {
    accountApi.post.mockRejectedValue({
      code: 'RATE_LIMITED',
      response: {
        data: { message: 'Too many wallet bundle updates. Try again later.' },
        status: 429,
      },
    });

    await expect(
      addWalletToBundle(
        'user-1',
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        '0xsignature',
        'Primary wallet',
      ),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Too many wallet bundle updates. Try again later.',
      status: 429,
    });

    expect(accountApi.post).toHaveBeenCalledWith('/users/user-1/wallets', {
      label: 'Primary wallet',
      signature: '0xsignature',
      wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    });
  });

  it('preserves wallet bundle server errors instead of remapping them to validation copy', async () => {
    accountApi.post.mockRejectedValue({
      response: {
        data: { message: 'Wallet bundle service is temporarily unavailable.' },
        status: 503,
      },
    });

    await expect(
      addWalletToBundle(
        'user-1',
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        '0xsignature',
        'Primary wallet',
      ),
    ).rejects.toMatchObject({
      message: 'Wallet bundle service is temporarily unavailable.',
      status: 503,
    });

    expect(accountApi.post).toHaveBeenCalledWith('/users/user-1/wallets', {
      label: 'Primary wallet',
      signature: '0xsignature',
      wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    });
  });

  it('rejects malformed wallet bundle success responses', async () => {
    accountApi.post.mockResolvedValue({ message: 'Wallet added.' });

    await expect(
      addWalletToBundle(
        'user-1',
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        '0xsignature',
        'Primary wallet',
      ),
    ).rejects.toThrow(/wallet_id/);

    expect(accountApi.post).toHaveBeenCalledWith('/users/user-1/wallets', {
      label: 'Primary wallet',
      signature: '0xsignature',
      wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    });
  });
});

describe('accountService wallet bundle removal errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves unauthorized remove wallet failures as AccountServiceError details', async () => {
    accountApi.delete.mockRejectedValue({
      code: 'UNAUTHORIZED',
      response: {
        data: { message: 'Unauthorized wallet bundle access.' },
        status: 401,
      },
    });

    await expect(
      removeWalletFromBundle('user-1', 'wallet-1'),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Unauthorized wallet bundle access.',
      status: 401,
    });

    expect(accountApi.delete).toHaveBeenCalledWith(
      '/users/user-1/wallets/wallet-1',
    );
  });
});
