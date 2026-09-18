import { afterEach, describe, expect, it, vi } from 'vitest';

describe('wallet token catalog canonical address validation', () => {
  afterEach(() => {
    vi.doUnmock('@zapengine/types/shared');
    vi.resetModules();
  });

  it('fails closed when a required canonical token address is missing', async () => {
    vi.resetModules();
    vi.doMock('@zapengine/types/shared', async () => {
      const actual = await vi.importActual<
        typeof import('@zapengine/types/shared')
      >('@zapengine/types/shared');

      return {
        ...actual,
        CANONICAL_TOKEN_ADDRESSES: {
          ...actual.CANONICAL_TOKEN_ADDRESSES,
          1: {
            ...actual.CANONICAL_TOKEN_ADDRESSES[1],
            USDC: undefined,
          },
        },
      };
    });

    await expect(import('@core/services/walletTokenCatalog')).rejects.toThrow(
      'Missing USDC address for eth',
    );
  });
});
