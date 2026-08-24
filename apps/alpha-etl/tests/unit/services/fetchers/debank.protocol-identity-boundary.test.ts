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

function validProtocol(overrides: Record<string, unknown> = {}) {
  return {
    chain: 'eth',
    has_supported_portfolio: true,
    id: 'aave3',
    logo_url: null,
    name: 'Aave V3',
    portfolio_item_list: [],
    ...overrides,
  };
}

describe('DeBankFetcher protocol identity boundaries', () => {
  const walletAddress = '0x1234567890123456789012345678901234567890';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['empty protocol id', { id: '' }],
    ['blank protocol chain', { chain: '   ' }],
  ])('rejects %s in strict mode', async (_label, overrides) => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    vi.spyOn(
      fetcher as unknown as { fetchWithRetry: () => Promise<unknown> },
      'fetchWithRetry',
    ).mockResolvedValue([validProtocol(overrides)]);

    await expect(
      fetcher.fetchComplexProtocolList(walletAddress),
    ).rejects.toThrow(
      'DeBank API error: DeBank complex protocol list validation failed',
    );
  });
});
