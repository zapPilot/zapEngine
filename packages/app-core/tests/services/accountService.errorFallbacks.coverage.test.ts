import { beforeEach, describe, expect, it, vi } from 'vitest';

const accountApi = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../../src/lib/http', () => ({
  httpUtils: { accountApi },
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const { removeWalletFromBundle } =
  await import('../../src/services/accountService');

describe('accountService fallback error messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([400, 409, 503])(
    'uses the generic message for status %i when the server omits one',
    async (status) => {
      accountApi.delete.mockRejectedValue({
        response: {
          data: {},
          status,
        },
      });

      await expect(
        removeWalletFromBundle('user-1', 'wallet-1'),
      ).rejects.toMatchObject({
        message: 'Account service error',
        status,
      });
    },
  );
});
