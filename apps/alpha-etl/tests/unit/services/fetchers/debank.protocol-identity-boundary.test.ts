import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeBankFetcher } from '../../../../src/modules/wallet/fetcher.js';
import {
  mockDeBankResponse,
  validProtocol,
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

describe('DeBankFetcher protocol identity boundaries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['empty protocol id', { id: '' }],
    ['blank protocol chain', { chain: '   ' }],
  ])('rejects %s in strict mode', async (_label, overrides) => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    mockDeBankResponse(fetcher, [validProtocol(overrides)]);

    await expect(
      fetcher.fetchComplexProtocolList(walletAddress),
    ).rejects.toThrow(
      'DeBank API error: DeBank complex protocol list validation failed',
    );
  });
});
