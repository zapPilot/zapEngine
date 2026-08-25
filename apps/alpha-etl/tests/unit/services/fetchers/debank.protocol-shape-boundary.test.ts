import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeBankFetcher } from '../../../../src/modules/wallet/fetcher.js';
import {
  mockDeBankResponse,
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

describe('DeBankFetcher protocol response shape boundaries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['object payload', { chain: 'eth', id: 'protocol' }],
    ['null payload', null],
  ])('rejects a non-array %s in strict mode', async (_label, response) => {
    const fetcher = new DeBankFetcher({ strictErrors: true });
    mockDeBankResponse(fetcher, response);

    await expect(
      fetcher.fetchComplexProtocolList(walletAddress),
    ).rejects.toThrow(
      'DeBank API error: DeBank API returned non-array response for complex protocol list',
    );
  });
});
