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

  function mockUpstreamFailure(fetcher: DeBankFetcher) {
    vi.spyOn(
      fetcher as unknown as { fetchWithRetry: () => Promise<unknown> },
      'fetchWithRetry',
    ).mockRejectedValue(new Error('upstream unavailable'));
  }

  function mockUpstreamResponse(fetcher: DeBankFetcher, response: unknown) {
    vi.spyOn(
      fetcher as unknown as { fetchWithRetry: () => Promise<unknown> },
      'fetchWithRetry',
    ).mockResolvedValue(response);
  }

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
    mockUpstreamFailure(fetcher);

    await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
      'DeBank API error: upstream unavailable',
    );
  });

  it('lets explicit strict mode override a degraded production environment', async () => {
    process.env.DEBANK_STRICT_ERRORS = 'false';
    const fetcher = new DeBankFetcher({ strictErrors: true });
    mockUpstreamFailure(fetcher);

    await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
      'DeBank API error: upstream unavailable',
    );
  });

  it('rejects malformed token elements instead of accepting partial wallet data', async () => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    mockUpstreamResponse(fetcher, [
      {
        amount: 'not-a-number',
        chain: 'eth',
        decimals: 18,
        id: '0xtoken',
        is_core: false,
        is_verified: true,
        is_wallet: true,
        name: 'Broken Token',
        symbol: 'BROKEN',
      },
    ]);

    await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
      'DeBank API error: DeBank token list validation failed',
    );
  });

  it('rejects malformed protocol payloads instead of accepting raw partial data', async () => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    mockUpstreamResponse(fetcher, [
      {
        chain: 'arb',
        portfolio_item_list: [],
      },
    ]);

    await expect(
      fetcher.fetchComplexProtocolList(walletAddress),
    ).rejects.toThrow(
      'DeBank API error: DeBank complex protocol list validation failed',
    );
  });
});
