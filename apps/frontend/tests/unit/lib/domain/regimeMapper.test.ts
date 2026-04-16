import { describe, expect, it, vi } from "vitest";

import {
  getRegimeFromSentiment,
  getRegimeFromStatus,
  REGIME_LABELS,
} from "@/lib/domain/regimeMapper";

vi.mock("@/utils/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("regimeMapper", () => {
  describe("REGIME_LABELS", () => {
    it("has labels for all five regimes", () => {
      expect(REGIME_LABELS.ef).toBe("Extreme Fear");
      expect(REGIME_LABELS.f).toBe("Fear");
      expect(REGIME_LABELS.n).toBe("Neutral");
      expect(REGIME_LABELS.g).toBe("Greed");
      expect(REGIME_LABELS.eg).toBe("Extreme Greed");
    });
  });

  describe("getRegimeFromSentiment", () => {
    it("returns ef for values 0-25", () => {
      expect(getRegimeFromSentiment(0)).toBe("ef");
      expect(getRegimeFromSentiment(25)).toBe("ef");
    });

    it("returns f for values 26-45", () => {
      expect(getRegimeFromSentiment(26)).toBe("f");
      expect(getRegimeFromSentiment(45)).toBe("f");
    });

    it("returns n for values 46-54", () => {
      expect(getRegimeFromSentiment(46)).toBe("n");
      expect(getRegimeFromSentiment(54)).toBe("n");
    });

    it("returns g for values 55-75", () => {
      expect(getRegimeFromSentiment(55)).toBe("g");
      expect(getRegimeFromSentiment(75)).toBe("g");
    });

    it("returns eg for values 76-100", () => {
      expect(getRegimeFromSentiment(76)).toBe("eg");
      expect(getRegimeFromSentiment(100)).toBe("eg");
    });

    it("returns n for NaN", () => {
      expect(getRegimeFromSentiment(NaN)).toBe("n");
    });

    it("returns n for Infinity", () => {
      expect(getRegimeFromSentiment(Infinity)).toBe("n");
    });

    it("returns n for negative values", () => {
      expect(getRegimeFromSentiment(-1)).toBe("n");
    });

    it("returns n for values above 100", () => {
      expect(getRegimeFromSentiment(101)).toBe("n");
    });
  });

  describe("getRegimeFromStatus", () => {
    it("returns ef for 'extreme fear'", () => {
      expect(getRegimeFromStatus("extreme fear")).toBe("ef");
      expect(getRegimeFromStatus("Extreme Fear")).toBe("ef");
    });

    it("returns f for 'fear'", () => {
      expect(getRegimeFromStatus("Fear")).toBe("f");
    });

    it("returns n for 'neutral'", () => {
      expect(getRegimeFromStatus("Neutral")).toBe("n");
    });

    it("returns g for 'greed'", () => {
      expect(getRegimeFromStatus("Greed")).toBe("g");
    });

    it("returns eg for 'extreme greed'", () => {
      expect(getRegimeFromStatus("Extreme Greed")).toBe("eg");
    });

    it("returns n for null", () => {
      expect(getRegimeFromStatus(null)).toBe("n");
    });

    it("returns n for undefined", () => {
      expect(getRegimeFromStatus(undefined)).toBe("n");
    });

    it("returns n for empty string", () => {
      expect(getRegimeFromStatus("")).toBe("n");
    });

    it("returns n for unknown status and logs warning", () => {
      expect(getRegimeFromStatus("unknown")).toBe("n");
    });

    it("handles whitespace-padded input", () => {
      expect(getRegimeFromStatus("  extreme fear  ")).toBe("ef");
    });
  });
});
