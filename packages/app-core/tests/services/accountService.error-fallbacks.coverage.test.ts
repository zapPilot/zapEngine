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

const { addWalletToBundle } = await import('../../src/services/accountService');

const addWallet = () =>
  addWalletToBundle(
    'user-1',
    '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    '0xsignature',
    'Primary wallet',
  );

describe('accountService error message fallback coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([400, 409, 503])(
    'uses the generic account error when status %i has no message',
    async (status) => {
      accountApi.post.mockRejectedValue({ response: { data: {}, status } });

      await expect(addWallet()).rejects.toMatchObject({
        message: 'Account service error',
        status,
      });
    },
  );
});
