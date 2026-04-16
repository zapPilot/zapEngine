/**
 * assetCategoryUtils - Unit Tests
 *
 * Tests for token-to-category mapping utilities.
 */

import { describe, expect, it } from "vitest";

import { getCategoryForToken } from "@/lib/domain/assetCategoryUtils";

describe("getCategoryForToken", () => {
  describe("BTC category", () => {
    it("should return 'btc' for BTC symbol", () => {
      expect(getCategoryForToken("BTC")).toBe("btc");
    });

    it("should return 'btc' for WBTC symbol", () => {
      expect(getCategoryForToken("WBTC")).toBe("btc");
    });

    it("should return 'btc' for lowercase btc", () => {
      expect(getCategoryForToken("btc")).toBe("btc");
    });

    it("should return 'btc' for mixed case wBtC", () => {
      expect(getCategoryForToken("wBtC")).toBe("btc");
    });
  });

  describe("ETH category", () => {
    it("should return 'eth' for ETH symbol", () => {
      expect(getCategoryForToken("ETH")).toBe("eth");
    });

    it("should return 'eth' for WETH symbol", () => {
      expect(getCategoryForToken("WETH")).toBe("eth");
    });

    it("should return 'eth' for stETH symbol", () => {
      expect(getCategoryForToken("stETH")).toBe("eth");
    });

    it("should return 'eth' for lowercase eth", () => {
      expect(getCategoryForToken("eth")).toBe("eth");
    });
  });

  describe("Stablecoin category", () => {
    it("should return 'stablecoin' for USDC", () => {
      expect(getCategoryForToken("USDC")).toBe("stablecoin");
    });

    it("should return 'stablecoin' for USDT", () => {
      expect(getCategoryForToken("USDT")).toBe("stablecoin");
    });

    it("should return 'stablecoin' for DAI", () => {
      expect(getCategoryForToken("DAI")).toBe("stablecoin");
    });

    it("should return 'stablecoin' for lowercase usdc", () => {
      expect(getCategoryForToken("usdc")).toBe("stablecoin");
    });
  });

  describe("Altcoin category (default)", () => {
    it("should return 'altcoin' for unknown tokens", () => {
      expect(getCategoryForToken("LINK")).toBe("altcoin");
    });

    it("should return 'altcoin' for UNI", () => {
      expect(getCategoryForToken("UNI")).toBe("altcoin");
    });

    it("should return 'altcoin' for AAVE", () => {
      expect(getCategoryForToken("AAVE")).toBe("altcoin");
    });

    it("should return 'altcoin' for random token", () => {
      expect(getCategoryForToken("RANDOM_TOKEN_XYZ")).toBe("altcoin");
    });

    it("should return 'altcoin' for empty string", () => {
      expect(getCategoryForToken("")).toBe("altcoin");
    });
  });

  describe("Case insensitivity", () => {
    it("should handle uppercase symbols", () => {
      expect(getCategoryForToken("BTC")).toBe("btc");
      expect(getCategoryForToken("ETH")).toBe("eth");
      expect(getCategoryForToken("USDC")).toBe("stablecoin");
    });

    it("should handle lowercase symbols", () => {
      expect(getCategoryForToken("btc")).toBe("btc");
      expect(getCategoryForToken("eth")).toBe("eth");
      expect(getCategoryForToken("usdc")).toBe("stablecoin");
    });

    it("should handle mixed case symbols", () => {
      expect(getCategoryForToken("Btc")).toBe("btc");
      expect(getCategoryForToken("Eth")).toBe("eth");
      expect(getCategoryForToken("Usdc")).toBe("stablecoin");
    });
  });
});
