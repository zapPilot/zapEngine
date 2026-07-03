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

const { AccountServiceError, addWalletToBundle, triggerWalletDataFetch } =
  await import('../../src/services/accountService');

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
        'Primary wallet',
      ),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Unauthorized wallet bundle access.',
      status: 401,
    });

    expect(accountApi.post).toHaveBeenCalledWith('/users/user-1/wallets', {
      label: 'Primary wallet',
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
        'Primary wallet',
      ),
    ).rejects.toMatchObject({
      message: 'This wallet is already associated with an account.',
      status: 409,
    });

    expect(accountApi.post).toHaveBeenCalledWith('/users/user-1/wallets', {
      label: 'Primary wallet',
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
        'Primary wallet',
      ),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Too many wallet bundle updates. Try again later.',
      status: 429,
    });

    expect(accountApi.post).toHaveBeenCalledWith('/users/user-1/wallets', {
      label: 'Primary wallet',
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
        'Primary wallet',
      ),
    ).rejects.toMatchObject({
      message: 'Wallet bundle service is temporarily unavailable.',
      status: 503,
    });

    expect(accountApi.post).toHaveBeenCalledWith('/users/user-1/wallets', {
      label: 'Primary wallet',
      wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    });
  });

  it('rejects malformed wallet bundle success responses', async () => {
    accountApi.post.mockResolvedValue({ message: 'Wallet added.' });

    await expect(
      addWalletToBundle(
        'user-1',
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        'Primary wallet',
      ),
    ).rejects.toThrow(/wallet_id/);

    expect(accountApi.post).toHaveBeenCalledWith('/users/user-1/wallets', {
      label: 'Primary wallet',
      wallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    });
  });
});
