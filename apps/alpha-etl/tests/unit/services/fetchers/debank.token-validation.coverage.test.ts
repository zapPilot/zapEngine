import { describe, expect, it, vi } from 'vitest';

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

describe('DeBankFetcher token validation coverage', () => {
  it('throws in strict mode when the token list fails validation', async () => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    mockDeBankResponse(fetcher, [
      validToken({ amount: 'not-a-number', chain: '' }),
    ]);

    await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
      'DeBank token list validation failed',
    );
  });

  it('returns raw data in non-strict mode when the token list fails validation', async () => {
    const fetcher = new DeBankFetcher({ strictErrors: false });
    const raw = [validToken({ amount: 'not-a-number', chain: '' })];
    mockDeBankResponse(fetcher, raw);

    await expect(fetcher.fetchWalletTokenList(walletAddress)).resolves.toEqual(
      raw,
    );
  });
});
