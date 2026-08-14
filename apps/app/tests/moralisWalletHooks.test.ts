import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMoralisWalletHistory } from '@/integration/moralisWallet';
import { useActivityData } from '@/integration/useActivityData';

const useQueryMock = vi.hoisted(() => vi.fn());
const getMoralisWalletHistoryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: useQueryMock,
  };
});

vi.mock('@zapengine/app-core/services', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@zapengine/app-core/services')>();
  return {
    ...actual,
    getMoralisWalletHistory: getMoralisWalletHistoryMock,
  };
});

beforeEach(() => {
  useQueryMock.mockReset();
  getMoralisWalletHistoryMock.mockReset();
});

describe('Moralis wallet query wrappers', () => {
  it('returns history query state with the mapped groups and summary', () => {
    const error = new Error('history failed');
    const refetch = vi.fn();
    useQueryMock.mockReturnValueOnce({
      data: {
        groups: [{ label: 'Today', events: [] }],
        summary: [
          { category: 'stable', usdNet: 50, label: '+50 USDC', share: 1 },
        ],
      },
      isLoading: false,
      isError: true,
      error,
      refetch,
    });

    expect(useMoralisWalletHistory('wallet-address')).toEqual({
      groups: [{ label: 'Today', events: [] }],
      summary: [
        { category: 'stable', usdNet: 50, label: '+50 USDC', share: 1 },
      ],
      isConnected: true,
      isLoading: false,
      isError: true,
      error,
      refetch,
    });
    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: ['desktop', 'moralis', 'wallet-history', ['wallet-address']],
      }),
    );
  });

  it('normalizes multiple addresses and fetches 50 history rows per address', async () => {
    const refetch = vi.fn();
    useQueryMock.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch,
    });
    getMoralisWalletHistoryMock
      .mockResolvedValueOnce([{ chain: 'base', response: { result: [] } }])
      .mockResolvedValueOnce([
        {
          chain: 'arbitrum',
          response: {
            result: [
              {
                hash: '0xreceived-eth',
                block_timestamp: null,
                receipt_status: '1',
                native_transfers: [
                  {
                    token_symbol: 'ETH',
                    direction: 'receive',
                    value_formatted: '1',
                    value_usd: '3000',
                  },
                ],
              },
            ],
          },
        },
      ]);

    expect(
      useMoralisWalletHistory([' 0xABC ', '0xabc', '0xDEF', null, undefined])
        .refetch,
    ).toBe(refetch);

    const queryOptions = useQueryMock.mock.calls[0]?.[0] as {
      enabled: boolean;
      queryFn: () => Promise<unknown>;
      queryKey: unknown;
    };
    expect(queryOptions).toMatchObject({
      enabled: true,
      queryKey: ['desktop', 'moralis', 'wallet-history', ['0xabc', '0xdef']],
    });

    await expect(queryOptions.queryFn()).resolves.toMatchObject({
      groups: [
        {
          label: 'Earlier',
          events: [
            expect.objectContaining({
              id: 'arbitrum-0xreceived-eth',
              category: 'eth',
            }),
          ],
        },
      ],
      summary: [expect.objectContaining({ category: 'eth', usdNet: 3000 })],
    });
    expect(getMoralisWalletHistoryMock.mock.calls).toEqual([
      ['0xabc', { limit: 50 }],
      ['0xdef', { limit: 50 }],
    ]);
  });

  it('retries both visited-wallet discovery and history for a visited bundle', () => {
    const visitedWalletsRefetch = vi.fn();
    const historyRefetch = vi.fn();
    useQueryMock
      .mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('wallet lookup failed'),
        refetch: visitedWalletsRefetch,
      })
      .mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
        refetch: historyRefetch,
      });

    const activity = useActivityData({
      isOwnBundle: false,
      viewingUserId: 'visited-user',
      ownWalletAddresses: [],
      ownAddress: null,
    });
    activity.refetch();

    expect(activity.isError).toBe(true);
    expect(visitedWalletsRefetch).toHaveBeenCalledOnce();
    expect(historyRefetch).toHaveBeenCalledOnce();
  });

  it('retries only history for the own bundle', () => {
    const disabledVisitedWalletsRefetch = vi.fn();
    const historyRefetch = vi.fn();
    useQueryMock
      .mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
        refetch: disabledVisitedWalletsRefetch,
      })
      .mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('history failed'),
        refetch: historyRefetch,
      });

    const activity = useActivityData({
      isOwnBundle: true,
      viewingUserId: null,
      ownWalletAddresses: ['0xowned'],
      ownAddress: null,
    });
    activity.refetch();

    expect(disabledVisitedWalletsRefetch).not.toHaveBeenCalled();
    expect(historyRefetch).toHaveBeenCalledOnce();
  });
});
