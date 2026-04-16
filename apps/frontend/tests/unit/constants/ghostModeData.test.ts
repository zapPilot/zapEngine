/**
 * Ghost Mode Preview Data Tests
 *
 * Tests for the Ghost Mode constants to ensure:
 * - All required fields are present
 * - Values are realistic and appealing
 * - Data structure matches expected format
 */

import { describe, expect, it } from "vitest";

import { GHOST_MODE_PREVIEW } from "@/constants/ghostModeData";

describe("GHOST_MODE_PREVIEW", () => {
  describe("portfolio metrics", () => {
    it("has a realistic preview balance", () => {
      expect(GHOST_MODE_PREVIEW.balance).toBeGreaterThan(0);
      expect(GHOST_MODE_PREVIEW.balance).toBe(12450.0);
    });

    it("has a positive ROI for appeal", () => {
      expect(GHOST_MODE_PREVIEW.roi).toBeGreaterThan(0);
      expect(GHOST_MODE_PREVIEW.roi).toBe(18.5);
    });

    it("has positive ROI changes", () => {
      expect(GHOST_MODE_PREVIEW.roiChange7d).toBeGreaterThan(0);
      expect(GHOST_MODE_PREVIEW.roiChange30d).toBeGreaterThan(0);
    });
  });

  describe("allocation data", () => {
    it("has valid crypto/stable split", () => {
      const { crypto, stable } = GHOST_MODE_PREVIEW.currentAllocation;
      expect(crypto + stable).toBe(100);
      expect(crypto).toBe(55);
      expect(stable).toBe(45);
    });

    it("has simplified crypto assets", () => {
      const { simplifiedCrypto } = GHOST_MODE_PREVIEW.currentAllocation;
      expect(simplifiedCrypto.length).toBeGreaterThan(0);

      // Check BTC is included
      const btc = simplifiedCrypto.find(a => a.symbol === "BTC");
      expect(btc).toBeDefined();
      expect(btc?.name).toBe("Bitcoin");
      expect(btc?.color).toBe("#F7931A");

      // Check ETH is included
      const eth = simplifiedCrypto.find(a => a.symbol === "ETH");
      expect(eth).toBeDefined();
      expect(eth?.name).toBe("Ethereum");
    });

    it("has valid constituents structure", () => {
      const { constituents } = GHOST_MODE_PREVIEW.currentAllocation;
      expect(constituents.crypto.length).toBeGreaterThan(0);
      expect(constituents.stable.length).toBeGreaterThan(0);
    });
  });

  describe("drift indicator", () => {
    it("has a small positive drift for visual interest", () => {
      expect(GHOST_MODE_PREVIEW.delta).toBeGreaterThan(0);
      expect(GHOST_MODE_PREVIEW.delta).toBeLessThan(5); // Not alarming
    });
  });

  describe("portfolio stats", () => {
    it("has realistic position counts", () => {
      expect(GHOST_MODE_PREVIEW.positions).toBeGreaterThan(0);
      expect(GHOST_MODE_PREVIEW.protocols).toBeGreaterThan(0);
      expect(GHOST_MODE_PREVIEW.chains).toBeGreaterThan(0);
    });
  });
});
