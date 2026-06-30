import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useMoralisWalletAssets,
  useMoralisWalletHistory,
} from '../src/integration/moralisWallet';

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
});

describe('Moralis wallet query wrappers', () => {
  it('keeps asset queries disabled while disconnected', () => {
    useQueryMock.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    });

    expect(useMoralisWalletAssets(null)).toMatchObject({
      assets: [],
      rows: [],
      totalUsdValue: null,
      isConnected: false,
      isLoading: false,
      isError: false,
      error: null,
    });
    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        queryKey: ['desktop', 'moralis', 'wallet-assets', []],
      }),
    );
  });

  it('sums live asset row values when connected', () => {
    useQueryMock.mockReturnValueOnce({
      data: {
        assets: [],
        rows: [{ usdValue: 10 }, { usdValue: null }, { usdValue: 5 }],
      },
      isLoading: true,
      isError: false,
      error: null,
    });

    expect(useMoralisWalletAssets('wallet-address')).toMatchObject({
      totalUsdValue: 15,
      isConnected: true,
      isLoading: true,
    });
  });

  it('returns history query state with the mapped groups', () => {
    const error = new Error('history failed');
    useQueryMock.mockReturnValueOnce({
      data: [{ label: 'Today', events: [] }],
      isLoading: false,
      isError: true,
      error,
    });

    expect(useMoralisWalletHistory('wallet-address')).toEqual({
      groups: [{ label: 'Today', events: [] }],
      isConnected: true,
      isLoading: false,
      isError: true,
      error,
    });
    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: ['desktop', 'moralis', 'wallet-history', ['wallet-address']],
      }),
    );
  });
});
