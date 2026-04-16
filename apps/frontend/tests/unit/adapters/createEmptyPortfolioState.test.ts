/**
 * createEmptyPortfolioState Ghost Mode Tests
 *
 * Tests that createEmptyPortfolioState uses ghost mode preview data
 * instead of zeros for unconnected users.
 */

import { describe, expect, it, vi } from "vitest";

import { createEmptyPortfolioState } from "@/adapters/walletPortfolioDataAdapter";
import { GHOST_MODE_PREVIEW } from "@/constants/ghostModeData";

// Mock the dependencies
vi.mock("@/adapters/portfolio/regimeAdapter", () => ({
  getRegimeStrategyInfo: vi.fn().mockReturnValue({
    previousRegime: null,
    strategyDirection: "default",
    regimeDuration: { days: 0, human_readable: "" },
  }),
  getTargetAllocation: vi.fn().mockReturnValue({ crypto: 60, stable: 40 }),
}));

vi.mock("@/lib/domain/regimeMapper", () => ({
  getRegimeFromSentiment: vi.fn().mockReturnValue("n"),
  getRegimeFromStatus: vi.fn().mockReturnValue("n"),
}));

vi.mock("@/constants/regimes", () => ({
  getDefaultQuoteForRegime: vi.fn().mockReturnValue("Test quote"),
}));

describe("createEmptyPortfolioState", () => {
  describe("uses ghost mode preview data", () => {
    it("uses preview balance instead of zero", () => {
      const result = createEmptyPortfolioState(null, null);
      expect(result.balance).toBe(GHOST_MODE_PREVIEW.balance);
      expect(result.balance).toBeGreaterThan(0);
    });

    it("uses preview ROI instead of zero", () => {
      const result = createEmptyPortfolioState(null, null);
      expect(result.roi).toBe(GHOST_MODE_PREVIEW.roi);
      expect(result.roi).toBeGreaterThan(0);
    });

    it("uses preview allocation data", () => {
      const result = createEmptyPortfolioState(null, null);
      expect(result.currentAllocation.crypto).toBe(
        GHOST_MODE_PREVIEW.currentAllocation.crypto
      );
      expect(result.currentAllocation.stable).toBe(
        GHOST_MODE_PREVIEW.currentAllocation.stable
      );
    });

    it("includes simplified crypto assets for portfolio composition", () => {
      const result = createEmptyPortfolioState(null, null);
      expect(result.currentAllocation.simplifiedCrypto.length).toBeGreaterThan(
        0
      );
      expect(result.currentAllocation.simplifiedCrypto).toEqual(
        GHOST_MODE_PREVIEW.currentAllocation.simplifiedCrypto
      );
    });

    it("uses preview delta instead of full drift", () => {
      const result = createEmptyPortfolioState(null, null);
      expect(result.delta).toBe(GHOST_MODE_PREVIEW.delta);
    });

    it("uses preview positions/protocols/chains counts", () => {
      const result = createEmptyPortfolioState(null, null);
      expect(result.positions).toBe(GHOST_MODE_PREVIEW.positions);
      expect(result.protocols).toBe(GHOST_MODE_PREVIEW.protocols);
      expect(result.chains).toBe(GHOST_MODE_PREVIEW.chains);
    });
  });

  describe("still uses real sentiment data", () => {
    it("uses sentiment value from API when provided", () => {
      const mockSentiment = {
        value: 25,
        status: "Fear",
        quote: { quote: "Real sentiment quote" },
      };
      const result = createEmptyPortfolioState(
        mockSentiment as Parameters<typeof createEmptyPortfolioState>[0],
        null
      );
      expect(result.sentimentValue).toBe(25);
      expect(result.sentimentStatus).toBe("Fear");
    });

    it("uses default sentiment when not provided", () => {
      const result = createEmptyPortfolioState(null, null);
      expect(result.sentimentValue).toBe(50);
      expect(result.sentimentStatus).toBe("Neutral");
    });
  });
});
