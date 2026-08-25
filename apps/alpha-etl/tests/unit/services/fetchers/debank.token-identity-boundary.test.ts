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

describe('DeBankFetcher token identity boundaries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['empty token id', { id: '' }],
    ['blank token chain', { chain: '   ' }],
  ])('rejects %s in strict mode', async (_label, overrides) => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    mockDeBankResponse(fetcher, [validToken(overrides)]);

    await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
      'DeBank API error: DeBank token list validation failed',
    );
  });
});
