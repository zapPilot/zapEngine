import { QueryClient } from '@tanstack/react-query';

import { CACHE_WINDOW } from '@/config/cacheWindow';

// Create a client instance with optimized configuration for DeFi app
// ETL updates run once daily, but we bound freshness to the hourly HTTP cache
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep React Query cache aligned with Cache-Control max-age/stale-while-revalidate
      staleTime: CACHE_WINDOW.staleTimeMs,
      gcTime: CACHE_WINDOW.gcTimeMs,
      // Retry failed requests 2 times (good for network issues)
      retry: 2,
      // Disable all automatic refetching since data updates daily
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      // Disable interval refetching
      refetchInterval: false,
      refetchIntervalInBackground: false,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
});

/**
 * Query key factories for consistent key management
 *
 * Centralized query key factory following React Query best practices.
 * All query keys should be defined here for type safety and cache invalidation consistency.
 *
 * @see https://tanstack.com/query/latest/docs/react/guides/query-keys
 */
export const queryKeys = {
  // User-related queries
  user: {
    all: ['user'] as const,
    byWallet: (walletAddress: string) =>
      ['user', 'by-wallet', walletAddress] as const,
    /** Query key for user data by userId (for bundle owner data) */
    byId: (userId: string) => ['user', 'by-id', userId] as const,
    bundleWallets: (userId: string) =>
      ['user', 'bundle-wallets', userId] as const,
    /** Query key for user's wallet list */
    wallets: (userId: string) => ['user-wallets', userId] as const,
  },

  // Portfolio-related queries
  portfolio: {
    all: ['portfolio'] as const,
    summary: (userId: string) => ['portfolio', 'summary', userId] as const,
    analytics: (userId: string) => ['portfolio', 'analytics', userId] as const,
    apr: (userId: string) => ['portfolio', 'apr', userId] as const,
    landingPage: (userId: string) =>
      ['portfolio', 'landing-page', userId] as const,
    yieldSummary: (userId: string) =>
      ['portfolio', 'yield-summary', userId] as const,
    borrowingPositions: (userId: string) =>
      ['portfolio', 'borrowing-positions', userId] as const,
  },

  // Strategy-related queries
  strategies: {
    all: ['strategies'] as const,
    lists: () => ['strategies', 'list'] as const,
    /** Query key for strategies list with optional config */
    list: (config?: unknown) => ['strategies', 'list', config] as const,
    /** Query key for strategies with portfolio data */
    withPortfolio: (userId?: string, config?: unknown) =>
      ['strategies', 'list', 'portfolio', userId, config] as const,
  },

  // Token balance queries
  balances: {
    all: ['tokenBalances'] as const,
    /**
     * Query key for token balances
     * @param chainId - The blockchain chain ID
     * @param walletAddress - The wallet address (lowercase)
     * @param tokenAddresses - Array of token addresses (lowercase, sorted)
     * @param skipCache - Whether to skip cache
     */
    list: (
      chainId: number,
      walletAddress: string,
      tokenAddresses: string[],
      skipCache: boolean,
    ) =>
      [
        'tokenBalances',
        chainId,
        walletAddress,
        tokenAddresses,
        skipCache,
      ] as const,
  },

  // Token price queries
  prices: {
    all: ['tokenPrices'] as const,
    /**
     * Query key for token prices
     * @param symbols - Comma-separated symbol string (e.g., "BTC,ETH,USDC")
     */
    list: (symbols: string) => ['tokenPrices', symbols] as const,
  },

  // Zap token queries
  zapTokens: {
    all: ['zapTokens'] as const,
    /**
     * Query key for supported zap tokens
     * @param chainId - The blockchain chain ID
     */
    byChain: (chainId: number) => ['zapTokens', chainId] as const,
  },

  // Strategy admin queries
  strategyAdmin: {
    all: ['strategyAdmin'] as const,
    configs: () => ['strategyAdmin', 'configs'] as const,
    config: (configId: string) =>
      ['strategyAdmin', 'config', configId] as const,
  },

  // Market sentiment queries
  sentiment: {
    all: ['sentiment'] as const,
    market: () => ['sentiment', 'market'] as const,
    regimeHistory: () => ['sentiment', 'regime-history'] as const,
  },
} as const;
