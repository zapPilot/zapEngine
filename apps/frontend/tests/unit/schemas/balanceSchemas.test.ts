import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  tokenBalanceRawSchema,
  validateWalletResponseData,
  walletResponseDataSchema,
} from "@/schemas/api/balanceSchemas";

describe("balanceSchemas", () => {
  describe("tokenBalanceRawSchema", () => {
    it("validates correct token balance with standard fields", () => {
      const validData = {
        address: "0x123",
        symbol: "ETH",
        name: "Ethereum",
        decimals: 18,
        balance: "1000000000000000000",
        balanceFormatted: 1.0,
        usdValue: 2000,
      };

      expect(() => tokenBalanceRawSchema.parse(validData)).not.toThrow();
    });

    it("validates token balance with alternative field names", () => {
      const validData = {
        tokenAddress: "0x456",
        tokenSymbol: "USDC",
        tokenName: "USD Coin",
        tokenDecimals: 6,
        balance: "1000000",
        usd_value: 1.0,
      };

      expect(() => tokenBalanceRawSchema.parse(validData)).not.toThrow();
    });

    it("validates token balance with snake_case field names", () => {
      const validData = {
        token_address: "0x789",
        token_symbol: "DAI",
        token_name: "Dai Stablecoin",
        token_decimals: "18",
        balance: 1000,
        fiatValue: 1000,
      };

      expect(() => tokenBalanceRawSchema.parse(validData)).not.toThrow();
    });

    it("accepts token balance with minimal fields", () => {
      const minimalData = {
        address: "0xabc",
      };

      expect(() => tokenBalanceRawSchema.parse(minimalData)).not.toThrow();
    });

    it("accepts token balance with metadata fields", () => {
      const dataWithMetadata = {
        address: "0xdef",
        symbol: "ARB",
        fromCache: true,
        isCache: false,
        source: "moralis",
      };

      expect(() => tokenBalanceRawSchema.parse(dataWithMetadata)).not.toThrow();
    });

    it("allows additional fields (passthrough)", () => {
      const dataWithExtra = {
        address: "0x111",
        symbol: "TEST",
        customField: "value",
        anotherField: 123,
      };

      const result = tokenBalanceRawSchema.parse(dataWithExtra);
      expect(result).toHaveProperty("customField", "value");
      expect(result).toHaveProperty("anotherField", 123);
    });
  });

  describe("walletResponseDataSchema", () => {
    it("validates response with new structure (data.balances)", () => {
      const validData = {
        data: {
          balances: [
            {
              address: "0x123",
              symbol: "USDC",
              balance: "1000000",
              decimals: 6,
            },
          ],
          nativeBalance: {
            address: "native",
            symbol: "ETH",
            balance: "1000000000000000000",
            decimals: 18,
          },
        },
        chainId: 1,
        address: "0xwallet",
        fromCache: false,
      };

      expect(() => walletResponseDataSchema.parse(validData)).not.toThrow();
    });

    it("validates response with legacy structure (direct tokens)", () => {
      const validData = {
        tokens: [
          {
            address: "0x456",
            symbol: "DAI",
            balance: "1000",
            decimals: 18,
          },
        ],
        chainId: "1",
        walletAddress: "0xwallet",
        cacheHit: true,
      };

      expect(() => walletResponseDataSchema.parse(validData)).not.toThrow();
    });

    it("validates response with cache metadata", () => {
      const validData = {
        tokens: [],
        fromCache: true,
        isCached: true,
        fetchedAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        timestamp: "2025-01-01T00:00:00Z",
      };

      expect(() => walletResponseDataSchema.parse(validData)).not.toThrow();
    });

    it("validates empty response", () => {
      const emptyData = {};

      expect(() => walletResponseDataSchema.parse(emptyData)).not.toThrow();
    });

    it("accepts response with additional fields (passthrough)", () => {
      const dataWithExtra = {
        tokens: [],
        chainId: 1,
        customField: "custom",
        metadata: { key: "value" },
      };

      const result = walletResponseDataSchema.parse(dataWithExtra);
      expect(result).toHaveProperty("customField", "custom");
      expect(result).toHaveProperty("metadata");
    });
  });

  // walletTokenBalancesSchema tests removed (schema deleted)

  describe("validation helper functions", () => {
    describe("validateWalletResponseData", () => {
      it("returns validated data for valid input", () => {
        const validData = {
          tokens: [],
          chainId: 1,
        };

        const result = validateWalletResponseData(validData);
        expect(result).toEqual(validData);
      });

      it("returns empty object for null input", () => {
        const result = validateWalletResponseData(null);
        expect(result).toEqual({});
      });

      it("returns empty object for undefined input", () => {
        const result = validateWalletResponseData();
        expect(result).toEqual({});
      });

      it("throws ZodError for invalid input", () => {
        const invalidData = "not-an-object";
        expect(() => validateWalletResponseData(invalidData)).toThrow(ZodError);
      });
    });
  });

  describe("edge cases", () => {
    it("handles empty strings where allowed", () => {
      const dataWithEmptyStrings = {
        address: "",
        symbol: "",
        name: "",
        balance: "0",
      };

      expect(() =>
        tokenBalanceRawSchema.parse(dataWithEmptyStrings)
      ).not.toThrow();
    });
  });
});
