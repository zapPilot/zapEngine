/**
 * SwapPage Test Utilities
 *
 * Comprehensive test helpers for SwapPage and form component testing.
 * Provides mock factories, setup utilities, and interaction helpers.
 *
 * @module tests/helpers/swapPageTestUtils
 */

import { QueryClient } from "@tanstack/react-query";
import { vi } from "vitest";

import type {
  AssetCategory,
  PortfolioSwapAction,
  Protocol,
} from "@/components/PortfolioAllocation/types";
import type { UserInfo } from "@/hooks/queries/wallet/useUserQuery";
import type { InvestmentOpportunity } from "@/types/investment";
import type { RiskLevel } from "@/types/risk";
import type { SwapToken } from "@/types/swap";

// =============================================================================
// MOCK FACTORIES
// =============================================================================

/**
 * Creates a mock SwapToken for testing
 *
 * @param overrides - Partial token data to override defaults
 * @returns Complete SwapToken test object
 *
 * @example
 * ```typescript
 * const usdc = createMockToken({ symbol: 'USDC', decimals: 6 });
 * const eth = createMockToken({ symbol: 'ETH', address: '0x0000...', balance: 5.5 });
 * ```
 */
export function createMockToken(overrides?: Partial<SwapToken>): SwapToken {
  return {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    chainId: 1,
    decimals: 6,
    balance: 1000,
    price: 1.0,
    logo_url: "/tokens/usdc.svg",
    optimized_symbol: "USDC",
    type: "erc20",
    ...overrides,
  };
}

/**
 * Creates a mock Protocol for testing
 *
 * @param overrides - Partial protocol data to override defaults
 * @returns Complete Protocol test object
 *
 * @example
 * ```typescript
 * const aaveProtocol = createMockProtocol({
 *   name: 'Aave V3',
 *   protocol: 'aave-v3',
 *   apy: 4.5
 * });
 * ```
 */
export function createMockProtocol(overrides?: Partial<Protocol>): Protocol {
  return {
    id: `protocol-${Math.random().toString(36).substr(2, 9)}`,
    name: "Aave V3 USDC",
    allocationPercentage: 50,
    chain: "Ethereum",
    protocol: "aave-v3",
    tvl: 1000000,
    apy: 3.5,
    riskScore: 3,
    poolSymbols: ["USDC"],
    aprConfidence: "high",
    aprBreakdown: {
      base: 2.5,
      reward: 1.0,
      total: 3.5,
      updatedAt: new Date().toISOString(),
    },
    targetTokens: ["USDC"],
    ...overrides,
  };
}

/**
 * Creates a mock AssetCategory for testing
 *
 * @param overrides - Partial category data to override defaults
 * @returns Complete AssetCategory test object
 *
 * @example
 * ```typescript
 * const stableCategory = createMockAssetCategory({
 *   name: 'Stablecoins',
 *   targetAssets: ['USDC', 'USDT', 'DAI']
 * });
 *
 * const categoryWithProtocols = createMockAssetCategory({
 *   protocols: [
 *     createMockProtocol({ name: 'Aave V3' }),
 *     createMockProtocol({ name: 'Compound V3' })
 *   ]
 * });
 * ```
 */
export function createMockAssetCategory(
  overrides?: Partial<AssetCategory>
): AssetCategory {
  return {
    id: `category-${Math.random().toString(36).substr(2, 9)}`,
    name: "Stablecoins",
    protocols: [],
    color: "#10b981",
    description: "Low-risk stable value preservation",
    targetAssets: ["USDC", "USDT", "DAI"],
    chains: ["ethereum", "arbitrum", "optimism"],
    protocolCount: 5,
    enabledProtocolCount: 3,
    ...overrides,
  };
}

/**
 * Creates a mock InvestmentOpportunity (Strategy) for testing
 *
 * @param overrides - Partial strategy data to override defaults
 * @returns Complete InvestmentOpportunity test object
 *
 * @example
 * ```typescript
 * const highYieldStrategy = createMockStrategy({
 *   name: 'High Yield DeFi',
 *   apr: 12.5,
 *   risk: 'High'
 * });
 *
 * const zapInStrategy = createMockStrategy({
 *   navigationContext: 'zapIn'
 * });
 * ```
 */
export function createMockStrategy(
  overrides?: Partial<InvestmentOpportunity>
): InvestmentOpportunity {
  return {
    id: `strategy-${Math.random().toString(36).substr(2, 9)}`,
    name: "Conservative Stablecoin Yield",
    apr: 5.5,
    risk: "Low" as RiskLevel,
    category: "Stablecoins",
    description: "Earn yield on stablecoins with minimal risk",
    tvl: "$500M",
    color: "#10b981",
    navigationContext: "invest",
    ...overrides,
  };
}

/**
 * Creates a mock PortfolioSwapAction for testing
 *
 * @param overrides - Partial action data to override defaults
 * @returns Complete PortfolioSwapAction test object
 *
 * @example
 * ```typescript
 * const zapInAction = createMockSwapAction({
 *   operationMode: 'zapIn',
 *   swapSettings: {
 *     fromToken: createMockToken({ symbol: 'USDC' }),
 *     amount: '1000'
 *   }
 * });
 * ```
 */
export function createMockSwapAction(
  overrides?: Partial<PortfolioSwapAction>
): PortfolioSwapAction {
  const category = createMockAssetCategory();

  return {
    operationMode: "zapIn",
    includedCategories: [
      {
        ...category,
        isExcluded: false,
        totalAllocationPercentage: 100,
        activeAllocationPercentage: 100,
        totalValue: 1000,
      },
    ],
    swapSettings: {
      fromToken: createMockToken(),
      amount: "1000",
      slippageTolerance: 0.5,
    },
    ...overrides,
  };
}

// =============================================================================
// SETUP UTILITIES
// =============================================================================

/**
 * Configuration for SwapPage mock setup
 */
export interface SwapPageMockConfig {
  /** User information (null for disconnected state) */
  userInfo?: UserInfo | null;
  /** Connected wallet address (null for disconnected state) */
  connectedWallet?: string | null;
  /** Current chain ID */
  chainId?: number;
  /** Array of asset categories/strategies */
  strategies?: AssetCategory[];
  /** Loading state for strategies */
  isLoading?: boolean;
  /** Error state for strategies */
  error?: Error | null;
  /** Whether strategies query is in initial loading state */
  isInitialLoading?: boolean;
  /** Whether strategies query is refetching */
  isRefetching?: boolean;
}

/**
 * Sets up all necessary mocks for SwapPage component testing
 *
 * Configures mocks for:
 * - useUser (UserContext)
 * - useChain
 * - useStrategiesWithPortfolioData
 * - intentService.executeUnifiedZap
 *
 * @param config - Configuration object for mock behavior
 * @returns Object containing all mocked functions for assertions
 *
 * @example
 * ```typescript
 * import { setupSwapPageMocks } from 'tests/helpers/swapPageTestUtils';
 * import * as UserContext from '@/contexts/UserContext';
 * import * as useChainModule from '@/hooks/useChain';
 *
 * vi.mock('@/contexts/UserContext');
 * vi.mock('@/hooks/useChain');
 * vi.mock('@/hooks/queries/useStrategiesQuery');
 * vi.mock('@/services/intentService');
 *
 * const mocks = setupSwapPageMocks({
 *   userInfo: { userId: 'user-123', walletAddress: '0xabc' },
 *   connectedWallet: '0xabc',
 *   chainId: 1,
 *   strategies: [createMockAssetCategory()]
 * });
 *
 * // Later in tests
 * expect(mocks.executeUnifiedZap).toHaveBeenCalled();
 * ```
 */
export function setupSwapPageMocks(config: SwapPageMockConfig = {}) {
  const {
    userInfo = { userId: "test-user-123", walletAddress: "0x123" },
    connectedWallet = "0x123",
    chainId = 1,
    strategies = [],
    isLoading = false,
    error = null,
    isInitialLoading = false,
    isRefetching = false,
  } = config;

  // Mock useUser
  const mockUseUser = vi.fn().mockReturnValue({
    userInfo,
    connectedWallet,
    isConnected: Boolean(connectedWallet),
    loading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue({}),
    triggerRefetch: vi.fn(),
  });

  // Mock useChain
  const mockUseChain = vi.fn().mockReturnValue({
    chain: chainId
      ? {
          id: chainId,
          name: chainId === 1 ? "Ethereum" : "Unknown",
          symbol: chainId === 1 ? "ETH" : "UNKNOWN",
        }
      : null,
    switchChain: vi.fn().mockResolvedValue(),
    isChainSupported: vi.fn().mockReturnValue(true),
    getChainInfo: vi.fn().mockReturnValue({
      id: chainId,
      name: "Ethereum",
      symbol: "ETH",
    }),
    getSupportedChains: vi.fn().mockReturnValue([
      { id: 1, name: "Ethereum", symbol: "ETH" },
      { id: 137, name: "Polygon", symbol: "MATIC" },
    ]),
  });

  // Mock useStrategiesWithPortfolioData
  const mockRefetch = vi.fn().mockResolvedValue({ data: strategies });
  const mockUseStrategiesWithPortfolioData = vi.fn().mockReturnValue({
    strategies,
    isLoading,
    isError: Boolean(error),
    error,
    isRefetching,
    refetch: mockRefetch,
    hasStrategies: strategies.length > 0,
    totalStrategies: strategies.length,
    isInitialLoading,
    isReloading: isRefetching || (isLoading && strategies.length > 0),
    hasPoolData: strategies.some(cat => cat.protocols?.length > 0),
    totalProtocols: strategies.reduce(
      (sum, cat) => sum + (cat.protocols?.length || 0),
      0
    ),
  });

  // Mock intentService.executeUnifiedZap
  const mockExecuteUnifiedZap = vi.fn().mockResolvedValue({
    intentId: "intent-123",
    status: "pending",
    transactions: [],
  });

  return {
    // Mock functions for direct access
    useUser: mockUseUser,
    useChain: mockUseChain,
    useStrategiesWithPortfolioData: mockUseStrategiesWithPortfolioData,
    executeUnifiedZap: mockExecuteUnifiedZap,

    // Helper for refetch assertions
    refetch: mockRefetch,

    // Helper for resetting all mocks
    resetAll: () => {
      mockUseUser.mockClear();
      mockUseChain.mockClear();
      mockUseStrategiesWithPortfolioData.mockClear();
      mockExecuteUnifiedZap.mockClear();
      mockRefetch.mockClear();
    },
  };
}

// =============================================================================
// INTERACTION HELPERS
// =============================================================================

/**
 * Simulates clicking an operation mode tab (zapIn, zapOut, rebalance)
 *
 * @param container - Test container from render()
 * @param mode - Operation mode to select
 *
 * @example
 * ```typescript
 * import { render } from 'tests/test-utils';
 * import { selectOperationMode } from 'tests/helpers/swapPageTestUtils';
 *
 * const { container } = render(<SwapPage {...props} />);
 * selectOperationMode(container, 'zapOut');
 *
 * expect(screen.getByText(/exit positions/i)).toBeInTheDocument();
 * ```
 */
export function selectOperationMode(
  container: HTMLElement,
  mode: "zapIn" | "zapOut" | "rebalance"
): void {
  const modeMap = {
    zapIn: /invest|zap in/i,
    zapOut: /exit|zap out/i,
    rebalance: /optimize|rebalance/i,
  };

  const button = Array.from(container.querySelectorAll("button")).find(btn =>
    modeMap[mode].test(btn.textContent || "")
  );

  if (!button) {
    throw new Error(`Could not find button for operation mode: ${mode}`);
  }

  button.click();
}

/**
 * Triggers a PortfolioSwapAction by simulating form submission
 *
 * This helper is useful for testing the onZapAction callback flow
 * from PortfolioAllocation to SwapPage.
 *
 * @param onZapAction - The onZapAction callback to trigger
 * @param action - Optional custom action (defaults to createMockSwapAction())
 *
 * @example
 * ```typescript
 * const onZapAction = vi.fn();
 * const customAction = createMockSwapAction({
 *   operationMode: 'zapOut',
 *   swapSettings: { amount: '500' }
 * });
 *
 * triggerZapAction(onZapAction, customAction);
 *
 * expect(onZapAction).toHaveBeenCalledWith(customAction);
 * ```
 */
export function triggerZapAction(
  onZapAction: (action: PortfolioSwapAction) => void,
  action?: PortfolioSwapAction
): void {
  const zapAction = action || createMockSwapAction();
  onZapAction(zapAction);
}

// =============================================================================
// QUERY CLIENT HELPERS
// =============================================================================

/**
 * Creates a test-optimized QueryClient for isolated testing
 *
 * @returns Configured QueryClient instance
 *
 * @example
 * ```typescript
 * import { QueryClientProvider } from '@tanstack/react-query';
 * import { createTestQueryClient } from 'tests/helpers/swapPageTestUtils';
 *
 * const queryClient = createTestQueryClient();
 *
 * render(
 *   <QueryClientProvider client={queryClient}>
 *     <SwapPage {...props} />
 *   </QueryClientProvider>
 * );
 * ```
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

/**
 * Type guard to check if a value is a valid SwapToken
 *
 * @param value - Value to check
 * @returns True if value is a SwapToken
 */
export function isSwapToken(value: unknown): value is SwapToken {
  if (typeof value !== "object" || value === null) return false;

  const token = value as Partial<SwapToken>;

  return (
    typeof token.symbol === "string" &&
    typeof token.address === "string" &&
    typeof token.chainId === "number" &&
    typeof token.decimals === "number"
  );
}

/**
 * Type guard to check if a value is a valid AssetCategory
 *
 * @param value - Value to check
 * @returns True if value is an AssetCategory
 */
export function isAssetCategory(value: unknown): value is AssetCategory {
  if (typeof value !== "object" || value === null) return false;

  const category = value as Partial<AssetCategory>;

  return (
    typeof category.id === "string" &&
    typeof category.name === "string" &&
    Array.isArray(category.protocols) &&
    typeof category.color === "string"
  );
}

// =============================================================================
// PRE-BUILT TEST SCENARIOS
// =============================================================================

/**
 * Pre-configured test scenarios for common use cases
 */
export const SwapPageTestScenarios = {
  /**
   * Connected user with strategies loaded (default happy path)
   */
  connectedWithStrategies: (): SwapPageMockConfig => ({
    userInfo: { userId: "user-123", walletAddress: "0xabc" },
    connectedWallet: "0xabc",
    chainId: 1,
    strategies: [
      createMockAssetCategory({
        name: "Stablecoins",
        protocols: [createMockProtocol()],
      }),
      createMockAssetCategory({
        name: "Blue Chips",
        targetAssets: ["WBTC", "WETH"],
      }),
    ],
    isLoading: false,
    error: null,
  }),

  /**
   * Disconnected user (wallet not connected)
   */
  disconnected: (): SwapPageMockConfig => ({
    userInfo: null,
    connectedWallet: null,
    chainId: undefined,
    strategies: [],
    isLoading: false,
    error: null,
  }),

  /**
   * Loading state (initial fetch)
   */
  loading: (): SwapPageMockConfig => ({
    userInfo: { userId: "user-123", walletAddress: "0xabc" },
    connectedWallet: "0xabc",
    chainId: 1,
    strategies: [],
    isLoading: true,
    isInitialLoading: true,
    error: null,
  }),

  /**
   * Error state (failed to fetch strategies)
   */
  error: (): SwapPageMockConfig => ({
    userInfo: { userId: "user-123", walletAddress: "0xabc" },
    connectedWallet: "0xabc",
    chainId: 1,
    strategies: [],
    isLoading: false,
    error: new Error("Failed to fetch strategies"),
  }),

  /**
   * Empty strategies (no available opportunities)
   */
  emptyStrategies: (): SwapPageMockConfig => ({
    userInfo: { userId: "user-123", walletAddress: "0xabc" },
    connectedWallet: "0xabc",
    chainId: 1,
    strategies: [],
    isLoading: false,
    error: null,
  }),

  /**
   * Refetching state (background refresh)
   */
  refetching: (): SwapPageMockConfig => ({
    userInfo: { userId: "user-123", walletAddress: "0xabc" },
    connectedWallet: "0xabc",
    chainId: 1,
    strategies: [createMockAssetCategory()],
    isLoading: false,
    isRefetching: true,
    error: null,
  }),

  /**
   * Multiple chains scenario
   */
  multiChain: (): SwapPageMockConfig => ({
    userInfo: { userId: "user-123", walletAddress: "0xabc" },
    connectedWallet: "0xabc",
    chainId: 137, // Polygon
    strategies: [
      createMockAssetCategory({
        name: "Polygon Stables",
        chains: ["polygon"],
      }),
    ],
    isLoading: false,
    error: null,
  }),
};
