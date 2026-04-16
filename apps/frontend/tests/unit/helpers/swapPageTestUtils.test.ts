/**
 * SwapPage Test Utilities - Unit Tests
 *
 * Tests for the test utility functions themselves to ensure they work correctly.
 * These tests validate the mock factories and setup utilities.
 */

import { describe, expect, it } from "vitest";

import {
  createMockAssetCategory,
  createMockProtocol,
  createMockStrategy,
  createMockSwapAction,
  createMockToken,
  createTestQueryClient,
  isAssetCategory,
  isSwapToken,
  SwapPageTestScenarios,
} from "../../helpers/swapPageTestUtils";

describe("SwapPage Test Utilities", () => {
  describe("Mock Factories", () => {
    describe("createMockToken", () => {
      it("should create a default USDC token", () => {
        const token = createMockToken();

        expect(token.symbol).toBe("USDC");
        expect(token.name).toBe("USD Coin");
        expect(token.decimals).toBe(6);
        expect(token.chainId).toBe(1);
        expect(token.address).toBeDefined();
        expect(token.balance).toBe(1000);
      });

      it("should apply overrides correctly", () => {
        const token = createMockToken({
          symbol: "ETH",
          decimals: 18,
          balance: 5.5,
        });

        expect(token.symbol).toBe("ETH");
        expect(token.decimals).toBe(18);
        expect(token.balance).toBe(5.5);
        expect(token.name).toBe("USD Coin"); // Default not overridden
      });
    });

    describe("createMockProtocol", () => {
      it("should create a default protocol", () => {
        const protocol = createMockProtocol();

        expect(protocol.id).toBeDefined();
        expect(protocol.name).toBeDefined();
        expect(protocol.chain).toBe("Ethereum");
        expect(protocol.apy).toBe(3.5);
        expect(protocol.allocationPercentage).toBe(50);
      });

      it("should apply custom protocol data", () => {
        const protocol = createMockProtocol({
          name: "Compound V3",
          protocol: "compound-v3",
          apy: 7.2,
        });

        expect(protocol.name).toBe("Compound V3");
        expect(protocol.protocol).toBe("compound-v3");
        expect(protocol.apy).toBe(7.2);
      });

      it("should include APR breakdown", () => {
        const protocol = createMockProtocol();

        expect(protocol.aprBreakdown).toBeDefined();
        expect(protocol.aprBreakdown?.base).toBe(2.5);
        expect(protocol.aprBreakdown?.reward).toBe(1.0);
        expect(protocol.aprBreakdown?.total).toBe(3.5);
      });
    });

    describe("createMockAssetCategory", () => {
      it("should create a default category", () => {
        const category = createMockAssetCategory();

        expect(category.id).toBeDefined();
        expect(category.name).toBe("Stablecoins");
        expect(category.protocols).toEqual([]);
        expect(category.color).toBe("#10b981");
        expect(category.targetAssets).toEqual(["USDC", "USDT", "DAI"]);
      });

      it("should include protocols when provided", () => {
        const protocol1 = createMockProtocol({ name: "Aave V3" });
        const protocol2 = createMockProtocol({ name: "Compound V3" });

        const category = createMockAssetCategory({
          protocols: [protocol1, protocol2],
        });

        expect(category.protocols).toHaveLength(2);
        expect(category.protocols[0].name).toBe("Aave V3");
        expect(category.protocols[1].name).toBe("Compound V3");
      });

      it("should apply custom category data", () => {
        const category = createMockAssetCategory({
          name: "Blue Chips",
          targetAssets: ["WBTC", "WETH"],
          color: "#3b82f6",
        });

        expect(category.name).toBe("Blue Chips");
        expect(category.targetAssets).toEqual(["WBTC", "WETH"]);
        expect(category.color).toBe("#3b82f6");
      });
    });

    describe("createMockStrategy", () => {
      it("should create a default strategy", () => {
        const strategy = createMockStrategy();

        expect(strategy.id).toBeDefined();
        expect(strategy.name).toBeDefined();
        expect(strategy.apr).toBe(5.5);
        expect(strategy.risk).toBe("Low");
        expect(strategy.category).toBe("Stablecoins");
        expect(strategy.navigationContext).toBe("invest");
      });

      it("should apply custom strategy data", () => {
        const strategy = createMockStrategy({
          name: "High Yield DeFi",
          apr: 15.0,
          risk: "High",
          navigationContext: "zapIn",
        });

        expect(strategy.name).toBe("High Yield DeFi");
        expect(strategy.apr).toBe(15.0);
        expect(strategy.risk).toBe("High");
        expect(strategy.navigationContext).toBe("zapIn");
      });
    });

    describe("createMockSwapAction", () => {
      it("should create a default zapIn action", () => {
        const action = createMockSwapAction();

        expect(action.operationMode).toBe("zapIn");
        expect(action.includedCategories).toHaveLength(1);
        expect(action.swapSettings.amount).toBe("1000");
        expect(action.swapSettings.slippageTolerance).toBe(0.5);
        expect(action.swapSettings.fromToken).toBeDefined();
      });

      it("should apply custom action data", () => {
        const action = createMockSwapAction({
          operationMode: "zapOut",
          swapSettings: {
            amount: "500",
            slippageTolerance: 1.0,
          },
        });

        expect(action.operationMode).toBe("zapOut");
        expect(action.swapSettings.amount).toBe("500");
        expect(action.swapSettings.slippageTolerance).toBe(1.0);
      });
    });
  });

  describe("Type Guards", () => {
    describe("isSwapToken", () => {
      it("should return true for valid SwapToken", () => {
        const token = createMockToken();
        expect(isSwapToken(token)).toBe(true);
      });

      it("should return false for invalid objects", () => {
        expect(isSwapToken(null)).toBe(false);
        expect(isSwapToken()).toBe(false);
        expect(isSwapToken({})).toBe(false);
        expect(isSwapToken({ symbol: "ETH" })).toBe(false); // Missing required fields
      });

      it("should validate required fields", () => {
        const partialToken = {
          symbol: "ETH",
          address: "0x123",
          chainId: 1,
        };
        expect(isSwapToken(partialToken)).toBe(false); // Missing decimals

        const completeToken = { ...partialToken, decimals: 18 };
        expect(isSwapToken(completeToken)).toBe(true);
      });
    });

    describe("isAssetCategory", () => {
      it("should return true for valid AssetCategory", () => {
        const category = createMockAssetCategory();
        expect(isAssetCategory(category)).toBe(true);
      });

      it("should return false for invalid objects", () => {
        expect(isAssetCategory(null)).toBe(false);
        expect(isAssetCategory()).toBe(false);
        expect(isAssetCategory({})).toBe(false);
        expect(isAssetCategory({ id: "test" })).toBe(false); // Missing required fields
      });

      it("should validate required fields", () => {
        const partial = {
          id: "cat-1",
          name: "Test",
          protocols: [],
        };
        expect(isAssetCategory(partial)).toBe(false); // Missing color

        const complete = { ...partial, color: "#fff" };
        expect(isAssetCategory(complete)).toBe(true);
      });
    });
  });

  describe("Query Client Helper", () => {
    it("should create a test-optimized QueryClient", () => {
      const queryClient = createTestQueryClient();

      expect(queryClient).toBeDefined();

      // Verify test-optimized settings
      const defaultOptions = queryClient.getDefaultOptions();
      expect(defaultOptions.queries?.retry).toBe(false);
      expect(defaultOptions.queries?.refetchOnWindowFocus).toBe(false);
      expect(defaultOptions.queries?.staleTime).toBe(Infinity);
    });
  });

  describe("Pre-built Test Scenarios", () => {
    it("should provide connectedWithStrategies scenario", () => {
      const config = SwapPageTestScenarios.connectedWithStrategies();

      expect(config.userInfo).toBeDefined();
      expect(config.connectedWallet).toBe("0xabc");
      expect(config.chainId).toBe(1);
      expect(config.strategies).toHaveLength(2);
      expect(config.isLoading).toBe(false);
      expect(config.error).toBeNull();
    });

    it("should provide disconnected scenario", () => {
      const config = SwapPageTestScenarios.disconnected();

      expect(config.userInfo).toBeNull();
      expect(config.connectedWallet).toBeNull();
      expect(config.chainId).toBeUndefined();
      expect(config.strategies).toEqual([]);
    });

    it("should provide loading scenario", () => {
      const config = SwapPageTestScenarios.loading();

      expect(config.isLoading).toBe(true);
      expect(config.isInitialLoading).toBe(true);
      expect(config.strategies).toEqual([]);
    });

    it("should provide error scenario", () => {
      const config = SwapPageTestScenarios.error();

      expect(config.error).toBeInstanceOf(Error);
      expect(config.error?.message).toBe("Failed to fetch strategies");
      expect(config.isLoading).toBe(false);
    });

    it("should provide emptyStrategies scenario", () => {
      const config = SwapPageTestScenarios.emptyStrategies();

      expect(config.userInfo).toBeDefined();
      expect(config.strategies).toEqual([]);
      expect(config.isLoading).toBe(false);
      expect(config.error).toBeNull();
    });

    it("should provide refetching scenario", () => {
      const config = SwapPageTestScenarios.refetching();

      expect(config.isRefetching).toBe(true);
      expect(config.strategies).toHaveLength(1);
    });

    it("should provide multiChain scenario", () => {
      const config = SwapPageTestScenarios.multiChain();

      expect(config.chainId).toBe(137); // Polygon
      expect(config.strategies).toHaveLength(1);
      expect(config.strategies?.[0]?.chains).toEqual(["polygon"]);
    });
  });
});
