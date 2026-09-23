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

describe('accountService conflict fallback coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the generic service error when a conflict has no message', async () => {
    accountApi.post.mockRejectedValue({
      response: {
        data: {},
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
      message: 'Account service error',
      status: 409,
    });
  });
});
