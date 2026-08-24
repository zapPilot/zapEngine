import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeBankFetcher } from '../../../../src/modules/wallet/fetcher.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/utils/mask.js', async () => {
  const { mockWalletAddressMask } = await import('../../../setup/mocks.js');
  return mockWalletAddressMask();
});

describe('DeBankFetcher production strictness', () => {
  const walletAddress = '0x1234567890123456789012345678901234567890';
  let originalNodeEnv: string | undefined;
  let originalStrictErrors: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalStrictErrors = process.env.DEBANK_STRICT_ERRORS;
    process.env.NODE_ENV = 'production';
    delete process.env.DEBANK_STRICT_ERRORS;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalStrictErrors === undefined) {
      delete process.env.DEBANK_STRICT_ERRORS;
    } else {
      process.env.DEBANK_STRICT_ERRORS = originalStrictErrors;
    }
    vi.restoreAllMocks();
  });

  it('rejects upstream failures instead of turning them into an empty wallet snapshot', async () => {
    const fetcher = new DeBankFetcher();
    vi.spyOn(fetcher as unknown as { fetchWithRetry: () => Promise<unknown> }, 'fetchWithRetry').mockRejectedValue(
      new Error('upstream unavailable'),
    );

    await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
      'DeBank API error: upstream unavailable',
    );
  });
});
