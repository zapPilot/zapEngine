import { describe, expect, it, vi } from 'vitest';

import { fetchWalletDataFromDeBank } from '../../../../src/modules/vip-users/common.js';
import type { DeBankFetcher } from '../../../../src/modules/wallet/fetcher.js';

const wallet = '0x1234567890123456789012345678901234567890';

function createFetcher(options: {
  tokenResult?: unknown[];
  tokenError?: Error;
  protocolResult?: unknown[];
  protocolError?: Error;
}) {
  const fetchWalletTokenList = options.tokenError
    ? vi.fn().mockRejectedValue(options.tokenError)
    : vi.fn().mockResolvedValue(options.tokenResult ?? []);
  const fetchComplexProtocolList = options.protocolError
    ? vi.fn().mockRejectedValue(options.protocolError)
    : vi.fn().mockResolvedValue(options.protocolResult ?? []);

  return {
    fetcher: {
      fetchWalletTokenList,
      fetchComplexProtocolList,
    } as unknown as DeBankFetcher,
    fetchWalletTokenList,
    fetchComplexProtocolList,
  };
}

describe('fetchWalletDataFromDeBank atomicity', () => {
  it.each([
    {
      name: 'token fetch fails after portfolio data succeeds',
      options: {
        tokenError: new Error('token fetch failed'),
        protocolResult: [{ id: 'protocol-result' }],
      },
      expectedError: 'token fetch failed',
    },
    {
      name: 'portfolio fetch fails after token data succeeds',
      options: {
        tokenResult: [{ id: 'token-result' }],
        protocolError: new Error('portfolio fetch failed'),
      },
      expectedError: 'portfolio fetch failed',
    },
  ])('$name', async ({ options, expectedError }) => {
    const { fetcher, fetchWalletTokenList, fetchComplexProtocolList } =
      createFetcher(options);

    await expect(
      fetchWalletDataFromDeBank(fetcher, wallet, {
        warningMessage: 'wallet fetch failed',
      }),
    ).rejects.toThrow(expectedError);

    expect(fetchWalletTokenList).toHaveBeenCalledOnce();
    expect(fetchComplexProtocolList).toHaveBeenCalledOnce();
    expect(fetchWalletTokenList).toHaveBeenCalledWith(wallet);
    expect(fetchComplexProtocolList).toHaveBeenCalledWith(wallet);
  });
});
