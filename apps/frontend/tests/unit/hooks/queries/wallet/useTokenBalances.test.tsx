import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useTokenBalances } from '@zapengine/app-core/hooks/queries/wallet/useTokenBalances';
import type { TransactionToken } from '@zapengine/app-core/types/domain/transaction';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetOnChainTokenBalance } = vi.hoisted(() => ({
  mockGetOnChainTokenBalance: vi.fn(),
}));
let mockAccount: { address: string } | undefined;

vi.mock('@zapengine/app-core/providers/WalletProvider', () => ({
  useWalletProvider: () => ({ account: mockAccount }),
}));

vi.mock('@zapengine/app-core/services', () => ({
  getOnChainTokenBalance: mockGetOnChainTokenBalance,
}));

function token(overrides: Partial<TransactionToken> = {}): TransactionToken {
  return {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0xaaa0000000000000000000000000000000000001',
    chainId: 42161,
    decimals: 6,
    ...overrides,
  };
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TokenBalancesWrapper';

  return { Wrapper, queryClient };
};

describe('useTokenBalances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccount = { address: '0x1234567890abcdef1234567890abcdef12345678' };
    mockGetOnChainTokenBalance.mockResolvedValue({
      balance: '1000000',
      usdValue: 1,
    });
  });

  it('runs one balance query per token and reports a connected wallet', async () => {
    const tokens = [
      token(),
      token({
        address: '0xbbb0000000000000000000000000000000000002',
        symbol: 'WETH',
        decimals: 18,
      }),
    ];
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useTokenBalances(42161, tokens), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.byAddress.get(tokens[0]!.address)?.isSuccess).toBe(
        true,
      );
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.byAddress.size).toBe(2);
    expect(mockGetOnChainTokenBalance).toHaveBeenCalledTimes(2);
    expect(mockGetOnChainTokenBalance).toHaveBeenCalledWith(
      42161,
      tokens[0]!.address,
      6,
      mockAccount!.address,
    );
  });

  it('gates queries off and reports disconnected when no account is present', () => {
    mockAccount = undefined;
    const tokens = [token()];
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useTokenBalances(42161, tokens), {
      wrapper: Wrapper,
    });

    expect(result.current.isConnected).toBe(false);
    expect(mockGetOnChainTokenBalance).not.toHaveBeenCalled();
    expect(result.current.byAddress.get(tokens[0]!.address)?.fetchStatus).toBe(
      'idle',
    );
  });

  it('does not fetch when the chain id is undefined', () => {
    const tokens = [token()];
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useTokenBalances(undefined, tokens), {
      wrapper: Wrapper,
    });

    expect(mockGetOnChainTokenBalance).not.toHaveBeenCalled();
    // The wallet is still connected even though the chain gate blocks fetching.
    expect(result.current.isConnected).toBe(true);
  });

  it('returns an empty map for an empty token list', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useTokenBalances(42161, []), {
      wrapper: Wrapper,
    });

    expect(result.current.byAddress.size).toBe(0);
    expect(result.current.isConnected).toBe(true);
  });
});
