import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMoralisWalletHistory } from '@/integration/moralisWallet';

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
