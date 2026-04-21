/**
 * Unit tests for DeBankPortfolioTransformer
 * Tests transformation of DeBank protocol data to PortfolioItemSnapshotInsert format
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DeBankPortfolioTransformer } from "../../../../src/modules/wallet/portfolioTransformer.js";
import type {
  DeBankProtocol,
  DeBankProtocolItem,
} from "../../../../src/modules/wallet/fetcher.js";

// Mock the logger to prevent console output during tests
vi.mock("../../../../src/utils/logger.js", async () => {
  const { mockLogger } = await import("../../../setup/mocks.js");
  return mockLogger();
});

// Mock the mask utility
vi.mock("../../../../src/utils/mask.js", () => ({
  maskWalletAddress: vi.fn(
    (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`,
  ),
}));

describe("DeBankPortfolioTransformer", () => {
  let transformer: DeBankPortfolioTransformer;
  const testWalletAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(() => {
    transformer = new DeBankPortfolioTransformer();
    vi.clearAllMocks();
  });

  describe("transformItem", () => {
    const mockProtocol: DeBankProtocol = {
      chain: "arb",
      dao_id: "aave",
      has_supported_portfolio: true,
      id: "arb_aave3",
      is_tvl: true,
      is_visible_in_defi: true,
      logo_url: "https://example.com/aave.png",
      name: "Aave V3",
      platform_token_id: null,
      portfolio_item_list: [],
    };

    const mockItem: DeBankProtocolItem = {
      asset_dict: { "0xtoken1": 100.5 },
      asset_token_list: [{ id: "0xtoken1", amount: 100.5 }],
      detail: { health_rate: 1.5, supply_apy: 0.05 },
      detail_types: ["lending", "collateral"],
      name: "Lending",
      pool: { id: "0xpool1", name: "Aave V3 Pool", adapter_id: "aave3" },
      proxy_detail: { proxy_contract_id: "0xproxy" },
      stats: {
        asset_usd_value: 1000.0,
        debt_usd_value: 0.0,
        net_usd_value: 1000.0,
      },
      update_at: 1234567890,
    };

    it("should transform a single protocol item successfully", () => {
      const result = transformer.transformItem({
        protocol: mockProtocol,
        item: mockItem,
        walletAddress: testWalletAddress,
      });

      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        wallet: testWalletAddress.toLowerCase(),
        chain: "arb",
        name: "Aave V3",
        name_item: "Lending",
        id_raw: "0xpool1",
        asset_usd_value: 1000.0,
        debt_usd_value: 0.0,
        net_usd_value: 1000.0,
        has_supported_portfolio: true,
        site_url: "https://example.com/aave.png",
      });

      // Verify JSONB fields
      expect(result?.detail).toEqual(mockItem.detail);
      expect(result?.asset_dict).toEqual(mockItem.asset_dict);
      expect(result?.asset_token_list).toEqual(mockItem.asset_token_list);
      expect(result?.detail_types).toEqual(mockItem.detail_types);
      expect(result?.pool).toEqual(mockItem.pool);
      expect(result?.proxy_detail).toEqual(mockItem.proxy_detail);

      // Verify timestamp fields
      expect(result?.snapshot_at).toBeDefined();
      expect(result?.update_at).toBe(1234567890);
    });

    it("should lowercase wallet address", () => {
      const upperCaseWallet = "0X1234567890123456789012345678901234567890";
      const result = transformer.transformItem({
        protocol: mockProtocol,
        item: mockItem,
        walletAddress: upperCaseWallet,
      });

      expect(result?.wallet).toBe(upperCaseWallet.toLowerCase());
    });

    it("should use current timestamp when update_at is missing", () => {
      const itemWithoutUpdateAt = { ...mockItem, update_at: undefined };
      const beforeTransform = Math.floor(Date.now() / 1000);

      const result = transformer.transformItem({
        protocol: mockProtocol,
        item: itemWithoutUpdateAt as DeBankProtocolItem,
        walletAddress: testWalletAddress,
      });

      const afterTransform = Math.floor(Date.now() / 1000);

      expect(result?.update_at).toBeGreaterThanOrEqual(beforeTransform);
      expect(result?.update_at).toBeLessThanOrEqual(afterTransform);
    });

    it("should return null for invalid numeric values (NaN)", () => {
      const invalidItem = {
        ...mockItem,
        stats: {
          asset_usd_value: NaN,
          debt_usd_value: 0,
          net_usd_value: NaN,
        },
      };

      const result = transformer.transformItem({
        protocol: mockProtocol,
        item: invalidItem,
        walletAddress: testWalletAddress,
      });

      expect(result).toBeNull();
    });

    it("should return null for invalid numeric values (Infinity)", () => {
      const invalidItem = {
        ...mockItem,
        stats: {
          asset_usd_value: Infinity,
          debt_usd_value: 0,
          net_usd_value: Infinity,
        },
      };

      const result = transformer.transformItem({
        protocol: mockProtocol,
        item: invalidItem,
        walletAddress: testWalletAddress,
      });

      expect(result).toBeNull();
    });

    it("should handle zero USD values", () => {
      const zeroValueItem = {
        ...mockItem,
        stats: {
          asset_usd_value: 0,
          debt_usd_value: 0,
          net_usd_value: 0,
        },
      };

      const result = transformer.transformItem({
        protocol: mockProtocol,
        item: zeroValueItem,
        walletAddress: testWalletAddress,
      });

      expect(result).not.toBeNull();
      expect(result?.asset_usd_value).toBe(0);
      expect(result?.debt_usd_value).toBe(0);
      expect(result?.net_usd_value).toBe(0);
    });

    it("should handle missing optional proxy_detail", () => {
      const itemWithoutProxy = { ...mockItem };
      delete (itemWithoutProxy as unknown).proxy_detail;

      const result = transformer.transformItem({
        protocol: mockProtocol,
        item: itemWithoutProxy,
        walletAddress: testWalletAddress,
      });

      expect(result).not.toBeNull();
      expect(result?.proxy_detail).toEqual({});
    });

    it("should handle empty logo_url", () => {
      const protocolWithoutLogo = { ...mockProtocol, logo_url: null };

      const result = transformer.transformItem({
        protocol: protocolWithoutLogo,
        item: mockItem,
        walletAddress: testWalletAddress,
      });

      expect(result?.site_url).toBe("");
    });

    it("should handle transformation errors gracefully", () => {
      const invalidItem = { ...mockItem, pool: null } as unknown;

      const result = transformer.transformItem({
        protocol: mockProtocol,
        item: invalidItem,
        walletAddress: testWalletAddress,
      });

      expect(result).toBeNull();
    });
  });

  describe("transformBatch", () => {
    const mockProtocols: DeBankProtocol[] = [
      {
        chain: "arb",
        dao_id: "aave",
        has_supported_portfolio: true,
        id: "arb_aave3",
        is_tvl: true,
        is_visible_in_defi: true,
        logo_url: "https://example.com/aave.png",
        name: "Aave V3",
        platform_token_id: null,
        portfolio_item_list: [
          {
            asset_dict: { "0xtoken1": 100.5 },
            asset_token_list: [{ id: "0xtoken1", amount: 100.5 }],
            detail: { health_rate: 1.5 },
            detail_types: ["lending"],
            name: "Lending",
            pool: { id: "0xpool1", name: "Aave V3 Pool" },
            proxy_detail: {},
            stats: {
              asset_usd_value: 1000.0,
              debt_usd_value: 0.0,
              net_usd_value: 1000.0,
            },
            update_at: 1234567890,
          },
          {
            asset_dict: { "0xtoken2": 50.0 },
            asset_token_list: [{ id: "0xtoken2", amount: 50.0 }],
            detail: { supply_apy: 0.03 },
            detail_types: ["yield"],
            name: "Yield",
            pool: { id: "0xpool2", name: "Aave V3 Yield" },
            stats: {
              asset_usd_value: 500.0,
              debt_usd_value: 0.0,
              net_usd_value: 500.0,
            },
            update_at: 1234567891,
          },
        ],
      },
      {
        chain: "eth",
        has_supported_portfolio: true,
        id: "eth_compound",
        is_tvl: true,
        is_visible_in_defi: true,
        logo_url: "https://example.com/compound.png",
        name: "Compound",
        platform_token_id: null,
        portfolio_item_list: [
          {
            asset_dict: { "0xtoken3": 200.0 },
            asset_token_list: [{ id: "0xtoken3", amount: 200.0 }],
            detail: { borrow_apy: 0.02 },
            detail_types: ["lending"],
            name: "Lending",
            pool: { id: "0xpool3", name: "Compound Pool" },
            stats: {
              asset_usd_value: 2000.0,
              debt_usd_value: 100.0,
              net_usd_value: 1900.0,
            },
            update_at: 1234567892,
          },
        ],
      },
    ];

    it("should transform multiple protocols with multiple items", () => {
      const results = transformer.transformBatch(
        mockProtocols,
        testWalletAddress,
      );

      expect(results).toHaveLength(3); // 2 items from Aave + 1 from Compound
      expect(results[0].name).toBe("Aave V3");
      expect(results[0].name_item).toBe("Lending");
      expect(results[1].name).toBe("Aave V3");
      expect(results[1].name_item).toBe("Yield");
      expect(results[2].name).toBe("Compound");
      expect(results[2].name_item).toBe("Lending");
    });

    it("should handle empty protocol list", () => {
      const results = transformer.transformBatch([], testWalletAddress);

      expect(results).toEqual([]);
    });

    it("should handle protocols with empty portfolio_item_list", () => {
      const emptyProtocols: DeBankProtocol[] = [
        {
          chain: "arb",
          has_supported_portfolio: false,
          id: "arb_empty",
          is_tvl: false,
          is_visible_in_defi: false,
          logo_url: null,
          name: "Empty Protocol",
          platform_token_id: null,
          portfolio_item_list: [],
        },
      ];

      const results = transformer.transformBatch(
        emptyProtocols,
        testWalletAddress,
      );

      expect(results).toEqual([]);
    });

    it("should filter out invalid items", () => {
      const protocolsWithInvalidItems: DeBankProtocol[] = [
        {
          ...mockProtocols[0],
          portfolio_item_list: [
            mockProtocols[0].portfolio_item_list[0],
            {
              ...mockProtocols[0].portfolio_item_list[0],
              stats: {
                asset_usd_value: NaN,
                debt_usd_value: NaN,
                net_usd_value: NaN,
              },
            },
          ],
        },
      ];

      const results = transformer.transformBatch(
        protocolsWithInvalidItems,
        testWalletAddress,
      );

      // Should only return valid items
      expect(results).toHaveLength(1);
      expect(results[0].name_item).toBe("Lending");
    });

    it("should handle mixed valid and invalid protocols", () => {
      const mixedProtocols: DeBankProtocol[] = [
        mockProtocols[0], // Valid with 2 items
        {
          ...mockProtocols[1],
          portfolio_item_list: [
            {
              ...mockProtocols[1].portfolio_item_list[0],
              stats: {
                asset_usd_value: NaN,
                debt_usd_value: NaN,
                net_usd_value: NaN,
              },
            },
          ],
        }, // Invalid item
      ];

      const results = transformer.transformBatch(
        mixedProtocols,
        testWalletAddress,
      );

      // Should only return 2 valid items from first protocol
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.name === "Aave V3")).toBe(true);
    });

    it("should preserve all fields for all transformed items", () => {
      const results = transformer.transformBatch(
        mockProtocols,
        testWalletAddress,
      );

      // Verify all results have required fields
      results.forEach((result) => {
        expect(result).toHaveProperty("wallet");
        expect(result).toHaveProperty("chain");
        expect(result).toHaveProperty("name");
        expect(result).toHaveProperty("name_item");
        expect(result).toHaveProperty("id_raw");
        expect(result).toHaveProperty("asset_usd_value");
        expect(result).toHaveProperty("debt_usd_value");
        expect(result).toHaveProperty("net_usd_value");
        expect(result).toHaveProperty("snapshot_at");
        expect(result).toHaveProperty("update_at");
        expect(result).toHaveProperty("has_supported_portfolio");
        expect(result).toHaveProperty("site_url");
        expect(result).toHaveProperty("detail");
        expect(result).toHaveProperty("asset_dict");
        expect(result).toHaveProperty("asset_token_list");
        expect(result).toHaveProperty("detail_types");
        expect(result).toHaveProperty("pool");
        expect(result).toHaveProperty("proxy_detail");
      });
    });
  });
});
