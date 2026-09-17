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

describe('DeBankFetcher token validation fallback coverage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns raw token data after schema validation fails in non-strict mode', async () => {
    const invalidTokenData = [{ id: 'token-with-missing-required-fields' }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(invalidTokenData), { status: 200 }),
    );

    const result = await new DeBankFetcher({
      rateLimitMs: 0,
      strictErrors: false,
    }).fetchWalletTokenList('0x1234567890123456789012345678901234567890');

    expect(result).toEqual(invalidTokenData);
  });
});
