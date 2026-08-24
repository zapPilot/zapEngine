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

function validProtocolItem(overrides: Record<string, unknown> = {}) {
  return {
    asset_dict: {},
    asset_token_list: [],
    detail: {},
    detail_types: [],
    name: 'Supply',
    pool: {},
    stats: {
      asset_usd_value: 100,
      debt_usd_value: 0,
      net_usd_value: 100,
    },
    update_at: 1_725_000_000,
    ...overrides,
  };
}

function validProtocol(itemOverrides: Record<string, unknown>) {
  return {
    chain: 'eth',
    has_supported_portfolio: true,
    id: 'aave3',
    logo_url: null,
    name: 'Aave V3',
    portfolio_item_list: [validProtocolItem(itemOverrides)],
  };
}

describe('DeBankFetcher protocol numeric boundaries', () => {
  const walletAddress = '0x1234567890123456789012345678901234567890';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      'non-finite net value',
      {
        stats: {
          asset_usd_value: 100,
          debt_usd_value: 0,
          net_usd_value: Number.POSITIVE_INFINITY,
        },
      },
    ],
    ['non-finite update timestamp', { update_at: Number.NEGATIVE_INFINITY }],
  ])('rejects %s in strict mode', async (_label, itemOverrides) => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    vi.spyOn(
      fetcher as unknown as { fetchWithRetry: () => Promise<unknown> },
      'fetchWithRetry',
    ).mockResolvedValue([validProtocol(itemOverrides)]);

    await expect(
      fetcher.fetchComplexProtocolList(walletAddress),
    ).rejects.toThrow(
      'DeBank API error: DeBank complex protocol list validation failed',
    );
  });
});
