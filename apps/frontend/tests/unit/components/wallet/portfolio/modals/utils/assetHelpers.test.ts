/**
 * Unit tests for assetHelpers
 */
import { describe, expect, it } from "vitest";

import {
  getChainLogo,
  getProtocolLogo,
} from "@/components/wallet/portfolio/modals/utils/assetHelpers";

describe("assetHelpers", () => {
  describe("getChainLogo", () => {
    it("should return empty string for undefined chainId", () => {
      expect(getChainLogo(undefined)).toBe("");
    });

    it("should return Arbitrum logo for chainId 42161", () => {
      expect(getChainLogo(42161)).toBe("/chains/arbitrum.svg");
    });

    it("should return Optimism logo for chainId 10", () => {
      expect(getChainLogo(10)).toBe("/chains/optimism.svg");
    });

    it("should return Base logo for chainId 8453", () => {
      expect(getChainLogo(8453)).toBe("/chains/base.svg");
    });

    it("should return Metis logo for chainId 1088", () => {
      expect(getChainLogo(1088)).toBe("/chains/metis.svg");
    });

    it("should return fallback Arbitrum logo for unknown chainId", () => {
      expect(getChainLogo(999)).toBe("/chains/arbitrum.svg");
    });
  });

  describe("getProtocolLogo", () => {
    it("should return empty string for undefined protocolId", () => {
      expect(getProtocolLogo(undefined)).toBe("");
    });

    it("should return GMX logo for gmx protocol", () => {
      expect(getProtocolLogo("gmx")).toBe("/protocols/gmx-v2.webp");
    });

    it("should return Hyperliquid logo for hyperliquid protocol", () => {
      expect(getProtocolLogo("hyperliquid")).toBe(
        "/protocols/hyperliquid.webp"
      );
    });

    it("should return Morpho logo for morpho protocol", () => {
      expect(getProtocolLogo("morpho")).toBe("/protocols/morpho.webp");
    });

    it("should return Aster logo for aster protocol", () => {
      expect(getProtocolLogo("aster")).toBe("/protocols/aster.webp");
    });

    it("should do case-insensitive matching", () => {
      expect(getProtocolLogo("GMX")).toBe("/protocols/gmx-v2.webp");
      expect(getProtocolLogo("MORPHO")).toBe("/protocols/morpho.webp");
    });

    it("should match partial protocol names", () => {
      expect(getProtocolLogo("gmx-v2-markets")).toBe("/protocols/gmx-v2.webp");
      expect(getProtocolLogo("morpho-blue")).toBe("/protocols/morpho.webp");
    });

    it("should return fallback for unknown protocol", () => {
      expect(getProtocolLogo("unknown-protocol")).toBe(
        "/protocols/hyperliquid.webp"
      );
    });
  });
});
