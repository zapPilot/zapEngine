import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeBankFetcher } from '../../../../src/modules/wallet/fetcher.js';
import {
  mockDeBankResponse,
  validToken,
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

describe('DeBankFetcher nullable production token fields', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts nullable verification, wallet, core, and price fields in strict mode', async () => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    const productionShapedTokens = [
      validToken({
        is_verified: null,
        price_24h_change: null,
      }),
      validToken({
        id: '0xpendle-lp',
        is_core: null,
        is_wallet: null,
        price: null,
        protocol_id: 'pendle',
      }),
    ];
    mockDeBankResponse(fetcher, productionShapedTokens);

    await expect(fetcher.fetchWalletTokenList(walletAddress)).resolves.toEqual(
      productionShapedTokens,
    );
  });
});
