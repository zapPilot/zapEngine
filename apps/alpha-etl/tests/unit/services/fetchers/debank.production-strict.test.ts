import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeBankFetcher } from '../../../../src/modules/wallet/fetcher.js';
import {
  mockDeBankFailure,
  mockDeBankResponse,
  validProtocol,
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

describe('DeBankFetcher production strictness', () => {
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
    mockDeBankFailure(fetcher, new Error('upstream unavailable'));

    await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
      'DeBank API error: upstream unavailable',
    );
  });

  it('lets explicit strict mode override a degraded production environment', async () => {
    process.env.DEBANK_STRICT_ERRORS = 'false';
    const fetcher = new DeBankFetcher({ strictErrors: true });
    mockDeBankFailure(fetcher, new Error('upstream unavailable'));

    await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
      'DeBank API error: upstream unavailable',
    );
  });

  it('rejects malformed token elements instead of accepting partial wallet data', async () => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    mockDeBankResponse(fetcher, [validToken({ amount: 'not-a-number' })]);

    await expect(fetcher.fetchWalletTokenList(walletAddress)).rejects.toThrow(
      'DeBank API error: DeBank token list validation failed',
    );
  });

  it('rejects malformed protocol payloads instead of accepting raw partial data', async () => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    mockDeBankResponse(fetcher, [
      validProtocol({ has_supported_portfolio: undefined }),
    ]);

    await expect(
      fetcher.fetchComplexProtocolList(walletAddress),
    ).rejects.toThrow(
      'DeBank API error: DeBank complex protocol list validation failed',
    );
  });
});
