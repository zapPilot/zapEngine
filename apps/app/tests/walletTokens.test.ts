import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWalletAssets } from '@/integration/walletTokens';

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: useQueryMock,
  };
});

beforeEach(() => {
  useQueryMock.mockReset();
  useQueryMock.mockReturnValue({
    data: { assets: [], rows: [], failedChains: [] },
    isLoading: false,
    isError: false,
    error: null,
  });
});

describe('wallet token balances', () => {
  it('reads token balances from Alchemy', () => {
    useWalletAssets('0x1234567890123456789012345678901234567890');

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: [
          'desktop',
          'alchemy',
          'wallet-assets',
          ['0x1234567890123456789012345678901234567890'],
        ],
      }),
    );
  });
});
