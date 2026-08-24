import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeBankFetcher } from '../../../../src/modules/wallet/fetcher.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/utils/mask.js', async () => {
  const { mockWalletAddressMask } = await import('../../../setup/mocks.js');
  return mockWalletAddressMask();
});

function validToken(overrides: Record<string, unknown> = {}) {
  return {
    amount: 1,
    chain: 'eth',
    decimals: 18,
    id: '0xtoken',
    is_core: false,
    is_verified: true,
    is_wallet: true,
    name: 'Token',
    symbol: 'TKN',
    ...overrides,
  };
}

describe('DeBankFetcher token numeric boundaries', () => {
  const walletAddress = '0x1234567890123456789012345678901234567890';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite token amount %s in strict mode',
    async (amount) => {
      const fetcher = new DeBankFetcher({ strictErrors: true });
      vi.spyOn(
        fetcher as unknown as { fetchWithRetry: () => Promise<unknown> },
        'fetchWithRetry',
      ).mockResolvedValue([validToken({ amount })]);

      await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
        'DeBank API error: DeBank token list validation failed',
      );
    },
  );

  it.each([-1, 1.5])(
    'rejects invalid token decimals %s in strict mode',
    async (decimals) => {
      const fetcher = new DeBankFetcher({ strictErrors: true });
      vi.spyOn(
        fetcher as unknown as { fetchWithRetry: () => Promise<unknown> },
        'fetchWithRetry',
      ).mockResolvedValue([validToken({ decimals })]);

      await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
        'DeBank API error: DeBank token list validation failed',
      );
    },
  );

  it.each([
    ['price', { price: Number.POSITIVE_INFINITY }],
    ['24h price change', { price_24h_change: Number.NEGATIVE_INFINITY }],
  ])('rejects non-finite token %s in strict mode', async (_label, overrides) => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    vi.spyOn(
      fetcher as unknown as { fetchWithRetry: () => Promise<unknown> },
      'fetchWithRetry',
    ).mockResolvedValue([validToken(overrides)]);

    await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
      'DeBank API error: DeBank token list validation failed',
    );
  });

  it('rejects negative token prices in strict mode', async () => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    vi.spyOn(
      fetcher as unknown as { fetchWithRetry: () => Promise<unknown> },
      'fetchWithRetry',
    ).mockResolvedValue([validToken({ price: -0.01 })]);

    await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
      'DeBank API error: DeBank token list validation failed',
    );
  });
});
