import { useQuery } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTransactionData } from '@/components/wallet/portfolio/modals/hooks/useTransactionData';

const mockUseChainQuery = vi.fn();
const mockUseTokenBalanceQuery = vi.fn();

vi.mock('@/hooks/queries/wallet/useChainQuery', () => ({
  useChainQuery: (...args: unknown[]) => mockUseChainQuery(...args),
}));

vi.mock('@/hooks/queries/wallet/useTokenBalanceQuery', () => ({
  useTokenBalanceQuery: (...args: unknown[]) =>
    mockUseTokenBalanceQuery(...args),
}));

vi.mock('@/services', () => ({
  transactionServiceMock: {
    getSupportedTokens: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

describe('useTransactionData', () => {
  const defaultTokenQueryResult = {
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  };

  const defaultBalanceQueryResult = {
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChainQuery.mockReturnValue({ data: null });
    vi.mocked(useQuery).mockReturnValue(defaultTokenQueryResult as any);
    mockUseTokenBalanceQuery.mockReturnValue(defaultBalanceQueryResult);
  });

  describe('normalizeChainList', () => {
    it('returns empty array when chains is null', () => {
      mockUseChainQuery.mockReturnValue({ data: null });
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: undefined,
          amount: '0',
        }),
      );
      expect(result.current.chainList).toEqual([]);
    });

    it('returns array when chains is array', () => {
      const chains = [{ chainId: 1, name: 'Ethereum' }];
      mockUseChainQuery.mockReturnValue({ data: chains });
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: undefined,
          amount: '0',
        }),
      );
      expect(result.current.chainList).toEqual(chains);
    });

    it('wraps single chain in array', () => {
      const chain = { chainId: 1, name: 'Ethereum' };
      mockUseChainQuery.mockReturnValue({ data: chain });
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: undefined,
          amount: '0',
        }),
      );
      expect(result.current.chainList).toEqual([chain]);
    });

    it('returns empty array when chains is undefined', () => {
      mockUseChainQuery.mockReturnValue({ data: undefined });
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: undefined,
          amount: '0',
        }),
      );
      expect(result.current.chainList).toEqual([]);
    });
  });

  describe('resolveSelectedToken', () => {
    it('returns null when no tokens available', () => {
      vi.mocked(useQuery).mockReturnValue({
        ...defaultTokenQueryResult,
        data: [],
      } as any);
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: '0xabc',
          amount: '0',
        }),
      );
      expect(result.current.selectedToken).toBeNull();
    });

    it('returns matching token when found', () => {
      const tokens = [
        { address: '0xabc', symbol: 'USDC', usdPrice: 1 },
        { address: '0xdef', symbol: 'ETH', usdPrice: 3000 },
      ];
      vi.mocked(useQuery).mockReturnValue({
        ...defaultTokenQueryResult,
        data: tokens,
      } as any);
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: '0xdef',
          amount: '0',
        }),
      );
      expect(result.current.selectedToken?.symbol).toBe('ETH');
    });

    it('falls back to first token when address not found', () => {
      const tokens = [{ address: '0xabc', symbol: 'USDC', usdPrice: 1 }];
      vi.mocked(useQuery).mockReturnValue({
        ...defaultTokenQueryResult,
        data: tokens,
      } as any);
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: '0xnotfound',
          amount: '0',
        }),
      );
      expect(result.current.selectedToken?.symbol).toBe('USDC');
    });

    it('returns null when tokens is undefined', () => {
      vi.mocked(useQuery).mockReturnValue({
        ...defaultTokenQueryResult,
        data: undefined,
      } as any);
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: '0xabc',
          amount: '0',
        }),
      );
      expect(result.current.selectedToken).toBeNull();
    });
  });

  describe('calculateUsdAmount', () => {
    it('calculates USD amount correctly', () => {
      const tokens = [{ address: '0xabc', symbol: 'ETH', usdPrice: 3000 }];
      vi.mocked(useQuery).mockReturnValue({
        ...defaultTokenQueryResult,
        data: tokens,
      } as any);
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: '0xabc',
          amount: '2.5',
        }),
      );
      expect(result.current.usdAmount).toBe(7500);
    });

    it('returns 0 when usdPrice is undefined', () => {
      const tokens = [{ address: '0xabc', symbol: 'ETH', usdPrice: undefined }];
      vi.mocked(useQuery).mockReturnValue({
        ...defaultTokenQueryResult,
        data: tokens,
      } as any);
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: '0xabc',
          amount: '2.5',
        }),
      );
      expect(result.current.usdAmount).toBe(0);
    });

    it('returns 0 for empty amount string', () => {
      const tokens = [{ address: '0xabc', symbol: 'ETH', usdPrice: 3000 }];
      vi.mocked(useQuery).mockReturnValue({
        ...defaultTokenQueryResult,
        data: tokens,
      } as any);
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: '0xabc',
          amount: '',
        }),
      );
      expect(result.current.usdAmount).toBe(0);
    });

    it('returns 0 for NaN amount', () => {
      const tokens = [{ address: '0xabc', symbol: 'ETH', usdPrice: 3000 }];
      vi.mocked(useQuery).mockReturnValue({
        ...defaultTokenQueryResult,
        data: tokens,
      } as any);
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: '0xabc',
          amount: 'abc',
        }),
      );
      expect(result.current.usdAmount).toBe(0);
    });
  });

  describe('mapTokenBalances', () => {
    it('returns empty when no selected token', () => {
      vi.mocked(useQuery).mockReturnValue({
        ...defaultTokenQueryResult,
        data: [],
      } as any);
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: undefined,
          amount: '0',
        }),
      );
      expect(result.current.balances).toEqual({});
    });

    it('returns balance mapped by address when both token and balance exist', () => {
      const tokens = [{ address: '0xabc', symbol: 'ETH', usdPrice: 3000 }];
      const balance = { balance: '1.5', symbol: 'ETH' };
      vi.mocked(useQuery).mockReturnValue({
        ...defaultTokenQueryResult,
        data: tokens,
      } as any);
      mockUseTokenBalanceQuery.mockReturnValue({
        ...defaultBalanceQueryResult,
        data: balance,
      });
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: '0xabc',
          amount: '0',
        }),
      );
      expect(result.current.balances).toEqual({ '0xabc': balance });
    });

    it('returns empty when balance is undefined', () => {
      const tokens = [{ address: '0xabc', symbol: 'ETH', usdPrice: 3000 }];
      vi.mocked(useQuery).mockReturnValue({
        ...defaultTokenQueryResult,
        data: tokens,
      } as any);
      mockUseTokenBalanceQuery.mockReturnValue({
        ...defaultBalanceQueryResult,
        data: undefined,
      });
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: '0xabc',
          amount: '0',
        }),
      );
      expect(result.current.balances).toEqual({});
    });
  });

  describe('loading states', () => {
    it('isLoading is true when tokens are loading', () => {
      vi.mocked(useQuery).mockReturnValue({
        ...defaultTokenQueryResult,
        isLoading: true,
      } as any);
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: undefined,
          amount: '0',
        }),
      );
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isLoadingTokens).toBe(true);
    });

    it('isLoading is true when balance is loading', () => {
      mockUseTokenBalanceQuery.mockReturnValue({
        ...defaultBalanceQueryResult,
        isLoading: true,
      });
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: undefined,
          amount: '0',
        }),
      );
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isLoadingBalance).toBe(true);
    });
  });

  describe('selectedChain', () => {
    it('returns matching chain from chain list', () => {
      const chains = [
        { chainId: 1, name: 'Ethereum' },
        { chainId: 137, name: 'Polygon' },
      ];
      mockUseChainQuery.mockReturnValue({ data: chains });
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 137,
          tokenAddress: undefined,
          amount: '0',
        }),
      );
      expect(result.current.selectedChain?.name).toBe('Polygon');
    });

    it('returns null when chainId not in list', () => {
      const chains = [{ chainId: 1, name: 'Ethereum' }];
      mockUseChainQuery.mockReturnValue({ data: chains });
      const { result } = renderHook(() =>
        useTransactionData({
          isOpen: true,
          chainId: 999,
          tokenAddress: undefined,
          amount: '0',
        }),
      );
      expect(result.current.selectedChain).toBeNull();
    });
  });
});
