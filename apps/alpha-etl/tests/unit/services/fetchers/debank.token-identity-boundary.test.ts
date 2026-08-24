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

describe('DeBankFetcher token identity boundaries', () => {
  const walletAddress = '0x1234567890123456789012345678901234567890';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['empty token id', { id: '' }],
    ['blank token chain', { chain: '   ' }],
  ])('rejects %s in strict mode', async (_label, overrides) => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    vi.spyOn(
      fetcher as unknown as { fetchWithRetry: () => Promise<unknown> },
      'fetchWithRetry',
    ).mockResolvedValue([validToken(overrides)]);

    await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
      'DeBank API error: DeBank token list validation failed',
    );
  });
});
