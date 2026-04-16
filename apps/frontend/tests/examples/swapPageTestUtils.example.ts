/**
 * SwapPage Test Utilities - Usage Examples
 *
 * This file demonstrates how to use the swapPageTestUtils in actual tests.
 * Copy these patterns into your test files as needed.
 */

import { vi } from "vitest";

import * as UserContext from "@/contexts/UserContext";
import * as useStrategiesQuery from "@/hooks/queries/useStrategiesQuery";
import * as useChainModule from "@/hooks/useChain";
import * as intentService from "@/services/intentService";

import {
  createMockAssetCategory,
  createMockStrategy,
  createMockToken,
  setupSwapPageMocks,
  SwapPageTestScenarios,
} from "../helpers/swapPageTestUtils";

// Example 1: Basic mock setup for SwapPage component tests
// Mock all dependencies
vi.mock("@/contexts/UserContext");
vi.mock("@/hooks/useChain");
vi.mock("@/hooks/queries/useStrategiesQuery");
vi.mock("@/services/intentService");

// Example 1: Testing SwapPage with connected user and strategies
export function exampleConnectedUserWithStrategies() {
  // Use pre-built scenario
  const scenario = SwapPageTestScenarios.connectedWithStrategies();
  const mocks = setupSwapPageMocks(scenario);

  // Apply mocks
  vi.mocked(UserContext.useUser).mockReturnValue(mocks.useUser());
  vi.mocked(useChainModule.useChain).mockReturnValue(mocks.useChain());
  vi.mocked(useStrategiesQuery.useStrategiesWithPortfolioData).mockReturnValue(
    mocks.useStrategiesWithPortfolioData()
  );
  vi.mocked(intentService.executeUnifiedZap).mockImplementation(
    mocks.executeUnifiedZap
  );

  // Now render your component
  // const { container } = render(<SwapPage strategy={createMockStrategy()} onBack={() => {}} />);

  // Make assertions
  // expect(mocks.executeUnifiedZap).toHaveBeenCalled();

  return { mocks };
}

// Example 2: Testing with custom strategies
export function exampleCustomStrategies() {
  const customStrategies = [
    createMockAssetCategory({
      name: "High Yield Stablecoins",
      targetAssets: ["USDC", "USDT"],
    }),
    createMockAssetCategory({
      name: "Blue Chip DeFi",
      targetAssets: ["WBTC", "WETH"],
    }),
  ];

  const mocks = setupSwapPageMocks({
    userInfo: { userId: "custom-user", walletAddress: "0xcustom" },
    connectedWallet: "0xcustom",
    chainId: 1,
    strategies: customStrategies,
  });

  vi.mocked(UserContext.useUser).mockReturnValue(mocks.useUser());
  vi.mocked(useChainModule.useChain).mockReturnValue(mocks.useChain());
  vi.mocked(useStrategiesQuery.useStrategiesWithPortfolioData).mockReturnValue(
    mocks.useStrategiesWithPortfolioData()
  );

  return { mocks, customStrategies };
}

// Example 3: Testing loading state
export function exampleLoadingState() {
  const scenario = SwapPageTestScenarios.loading();
  const mocks = setupSwapPageMocks(scenario);

  vi.mocked(UserContext.useUser).mockReturnValue(mocks.useUser());
  vi.mocked(useChainModule.useChain).mockReturnValue(mocks.useChain());
  vi.mocked(useStrategiesQuery.useStrategiesWithPortfolioData).mockReturnValue(
    mocks.useStrategiesWithPortfolioData()
  );

  // Verify loading UI is shown
  // expect(screen.getByText(/loading strategies/i)).toBeInTheDocument();

  return { mocks };
}

// Example 4: Testing error state
export function exampleErrorState() {
  const scenario = SwapPageTestScenarios.error();
  const mocks = setupSwapPageMocks(scenario);

  vi.mocked(UserContext.useUser).mockReturnValue(mocks.useUser());
  vi.mocked(useChainModule.useChain).mockReturnValue(mocks.useChain());
  vi.mocked(useStrategiesQuery.useStrategiesWithPortfolioData).mockReturnValue(
    mocks.useStrategiesWithPortfolioData()
  );

  // Verify error UI is shown
  // expect(screen.getByText(/failed to load strategies/i)).toBeInTheDocument();

  return { mocks };
}

// Example 5: Testing disconnected state
export function exampleDisconnectedState() {
  const scenario = SwapPageTestScenarios.disconnected();
  const mocks = setupSwapPageMocks(scenario);

  vi.mocked(UserContext.useUser).mockReturnValue(mocks.useUser());
  vi.mocked(useChainModule.useChain).mockReturnValue(mocks.useChain());
  vi.mocked(useStrategiesQuery.useStrategiesWithPortfolioData).mockReturnValue(
    mocks.useStrategiesWithPortfolioData()
  );

  return { mocks };
}

// Example 6: Testing ZapIn operation
export async function exampleZapInOperation() {
  const mocks = setupSwapPageMocks({
    ...SwapPageTestScenarios.connectedWithStrategies(),
  });

  vi.mocked(UserContext.useUser).mockReturnValue(mocks.useUser());
  vi.mocked(useChainModule.useChain).mockReturnValue(mocks.useChain());
  vi.mocked(useStrategiesQuery.useStrategiesWithPortfolioData).mockReturnValue(
    mocks.useStrategiesWithPortfolioData()
  );
  vi.mocked(intentService.executeUnifiedZap).mockImplementation(
    mocks.executeUnifiedZap
  );

  // Render component
  // const { container } = render(<SwapPage {...props} />);

  // Simulate user interaction
  // const user = userEvent.setup();
  // await user.click(screen.getByRole('button', { name: /invest/i }));

  // Verify ZapIn was executed
  // await waitFor(() => {
  //   expect(mocks.executeUnifiedZap).toHaveBeenCalledWith(
  //     expect.objectContaining({
  //       params: expect.objectContaining({
  //         inputToken: expect.any(String),
  //         inputAmount: expect.any(String)
  //       })
  //     })
  //   );
  // });

  return { mocks };
}

// Example 7: Testing with custom tokens
export function exampleCustomTokens() {
  const usdcToken = createMockToken({
    symbol: "USDC",
    decimals: 6,
    balance: 10000,
  });

  const wethToken = createMockToken({
    symbol: "WETH",
    decimals: 18,
    address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    balance: 5.5,
  });

  return { usdcToken, wethToken };
}

// Example 8: Testing multi-chain scenarios
export function exampleMultiChain() {
  const polygonScenario = SwapPageTestScenarios.multiChain();
  const mocks = setupSwapPageMocks(polygonScenario);

  vi.mocked(UserContext.useUser).mockReturnValue(mocks.useUser());
  vi.mocked(useChainModule.useChain).mockReturnValue(mocks.useChain());
  vi.mocked(useStrategiesQuery.useStrategiesWithPortfolioData).mockReturnValue(
    mocks.useStrategiesWithPortfolioData()
  );

  // Verify chain-specific behavior
  // expect(mocks.useChain().chain?.id).toBe(137); // Polygon

  return { mocks };
}

// Example 9: Testing form validation
export function exampleFormValidation() {
  const mocks = setupSwapPageMocks(
    SwapPageTestScenarios.connectedWithStrategies()
  );

  // Create invalid swap action (no token)
  // const invalidAction = createMockSwapAction({
  //   swapSettings: {
  //     fromToken: undefined,
  //     amount: '1000'
  //   }
  // });

  // Trigger action should fail validation
  // expect(() => triggerZapAction(onZapAction, invalidAction)).toThrow();

  return { mocks };
}

// Example 10: Testing refetch behavior
export async function exampleRefetchBehavior() {
  const mocks = setupSwapPageMocks({
    ...SwapPageTestScenarios.connectedWithStrategies(),
  });

  vi.mocked(UserContext.useUser).mockReturnValue(mocks.useUser());
  vi.mocked(useChainModule.useChain).mockReturnValue(mocks.useChain());
  vi.mocked(useStrategiesQuery.useStrategiesWithPortfolioData).mockReturnValue(
    mocks.useStrategiesWithPortfolioData()
  );

  // Trigger refetch
  // await user.click(screen.getByRole('button', { name: /try again/i }));

  // Verify refetch was called
  // await waitFor(() => {
  //   expect(mocks.refetch).toHaveBeenCalled();
  // });

  return { mocks };
}

/**
 * Full integration test example
 */
export async function exampleFullIntegrationTest() {
  // 1. Setup mocks
  const customStrategy = createMockStrategy({
    name: "Conservative Yield",
    apr: 5.5,
    navigationContext: "zapIn",
  });

  const mocks = setupSwapPageMocks({
    userInfo: { userId: "test-user-123", walletAddress: "0xabc" },
    connectedWallet: "0xabc",
    chainId: 1,
    strategies: [
      createMockAssetCategory({
        name: "Stablecoins",
        protocols: [
          {
            id: "aave-usdc",
            name: "Aave V3 USDC",
            allocationPercentage: 50,
            chain: "Ethereum",
            protocol: "aave-v3",
            apy: 3.5,
          },
        ],
      }),
    ],
  });

  // 2. Apply mocks
  vi.mocked(UserContext.useUser).mockReturnValue(mocks.useUser());
  vi.mocked(useChainModule.useChain).mockReturnValue(mocks.useChain());
  vi.mocked(useStrategiesQuery.useStrategiesWithPortfolioData).mockReturnValue(
    mocks.useStrategiesWithPortfolioData()
  );
  vi.mocked(intentService.executeUnifiedZap).mockImplementation(
    mocks.executeUnifiedZap
  );

  // 3. Render component
  // const { container } = render(
  //   <SwapPage strategy={customStrategy} onBack={() => {}} />
  // );

  // 4. Verify initial state
  // expect(screen.getByText(/conservative yield/i)).toBeInTheDocument();
  // expect(screen.getByText(/stablecoins/i)).toBeInTheDocument();

  // 5. Simulate user interaction
  // const user = userEvent.setup();
  // await user.type(screen.getByLabelText(/amount/i), '1000');
  // await user.click(screen.getByRole('button', { name: /invest/i }));

  // 6. Verify execution
  // await waitFor(() => {
  //   expect(mocks.executeUnifiedZap).toHaveBeenCalledWith(
  //     expect.objectContaining({
  //       userAddress: '0xabc',
  //       chainId: 1,
  //       params: expect.objectContaining({
  //         inputAmount: '1000'
  //       })
  //     })
  //   );
  // });

  // 7. Cleanup
  mocks.resetAll();

  return { mocks, customStrategy };
}
