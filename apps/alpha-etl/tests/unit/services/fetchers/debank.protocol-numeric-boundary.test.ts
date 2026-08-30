import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeBankFetcher } from '../../../../src/modules/wallet/fetcher.js';
import {
  mockDeBankResponse,
  validProtocol,
  validProtocolItem,
  walletAddress,
} from './debank.strict-test-helpers.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/utils/mask.js', async () => {
  const { mockWalletAddressMask } = await import('../../../setup/mocks.js');
  return mockWalletAddressMask();
});

describe('DeBankFetcher protocol numeric boundaries', () => {
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
    mockDeBankResponse(fetcher, [
      validProtocol({
        portfolio_item_list: [validProtocolItem(itemOverrides)],
      }),
    ]);

    await expect(
      fetcher.fetchComplexProtocolList(walletAddress),
    ).rejects.toThrow(
      'DeBank API error: DeBank complex protocol list validation failed',
    );
  });
});
