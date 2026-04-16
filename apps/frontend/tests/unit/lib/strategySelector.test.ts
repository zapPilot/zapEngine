/**
 * Strategy Selector Tests
 *
 * Tests for regime transition direction calculation, strategy selection,
 * and UI metadata generation.
 */

import { describe, expect, it } from "vitest";

import {
  computeStrategyDirection,
  getActiveStrategy,
  getRegimeName,
  getStrategyMeta,
  REGIME_ORDER,
} from "@/lib/domain/strategySelector";
import type {
  DirectionType,
  RegimeId,
} from "@/schemas/api/regimeHistorySchemas";

describe("strategySelector", () => {
  describe("REGIME_ORDER", () => {
    it("should define correct order from bearish to bullish", () => {
      expect(REGIME_ORDER.ef).toBe(0);
      expect(REGIME_ORDER.f).toBe(1);
      expect(REGIME_ORDER.n).toBe(2);
      expect(REGIME_ORDER.g).toBe(3);
      expect(REGIME_ORDER.eg).toBe(4);
    });

    it("should have all regime IDs defined", () => {
      expect(Object.keys(REGIME_ORDER)).toHaveLength(5);
      expect(REGIME_ORDER).toHaveProperty("ef");
      expect(REGIME_ORDER).toHaveProperty("f");
      expect(REGIME_ORDER).toHaveProperty("n");
      expect(REGIME_ORDER).toHaveProperty("g");
      expect(REGIME_ORDER).toHaveProperty("eg");
    });
  });

  describe("computeStrategyDirection", () => {
    describe("fromLeft transitions (moving toward greed)", () => {
      it("should return fromLeft for ef -> f", () => {
        expect(computeStrategyDirection("f", "ef")).toBe("fromLeft");
      });

      it("should return fromLeft for ef -> n", () => {
        expect(computeStrategyDirection("n", "ef")).toBe("fromLeft");
      });

      it("should return fromLeft for f -> n", () => {
        expect(computeStrategyDirection("n", "f")).toBe("fromLeft");
      });

      it("should return fromLeft for f -> g", () => {
        expect(computeStrategyDirection("g", "f")).toBe("fromLeft");
      });

      it("should return fromLeft for n -> g", () => {
        expect(computeStrategyDirection("g", "n")).toBe("fromLeft");
      });

      it("should return fromLeft for n -> eg", () => {
        expect(computeStrategyDirection("eg", "n")).toBe("fromLeft");
      });

      it("should return fromLeft for g -> eg", () => {
        expect(computeStrategyDirection("eg", "g")).toBe("fromLeft");
      });

      it("should return fromLeft for ef -> eg (extreme jump)", () => {
        expect(computeStrategyDirection("eg", "ef")).toBe("fromLeft");
      });
    });

    describe("fromRight transitions (moving toward fear)", () => {
      it("should return fromRight for f -> ef", () => {
        expect(computeStrategyDirection("ef", "f")).toBe("fromRight");
      });

      it("should return fromRight for n -> ef", () => {
        expect(computeStrategyDirection("ef", "n")).toBe("fromRight");
      });

      it("should return fromRight for n -> f", () => {
        expect(computeStrategyDirection("f", "n")).toBe("fromRight");
      });

      it("should return fromRight for g -> f", () => {
        expect(computeStrategyDirection("f", "g")).toBe("fromRight");
      });

      it("should return fromRight for g -> n", () => {
        expect(computeStrategyDirection("n", "g")).toBe("fromRight");
      });

      it("should return fromRight for eg -> n", () => {
        expect(computeStrategyDirection("n", "eg")).toBe("fromRight");
      });

      it("should return fromRight for eg -> g", () => {
        expect(computeStrategyDirection("g", "eg")).toBe("fromRight");
      });

      it("should return fromRight for eg -> ef (extreme jump)", () => {
        expect(computeStrategyDirection("ef", "eg")).toBe("fromRight");
      });
    });

    describe("default direction", () => {
      it("should return default when previous is null", () => {
        expect(computeStrategyDirection("n", null)).toBe("default");
      });

      it("should return default when previous is null for any regime", () => {
        const regimes: RegimeId[] = ["ef", "f", "n", "g", "eg"];
        for (const regime of regimes) {
          expect(computeStrategyDirection(regime, null)).toBe("default");
        }
      });

      it("should return default when regimes are the same", () => {
        expect(computeStrategyDirection("n", "n")).toBe("default");
        expect(computeStrategyDirection("ef", "ef")).toBe("default");
        expect(computeStrategyDirection("eg", "eg")).toBe("default");
      });
    });

    describe("edge cases", () => {
      it("should handle all regime pairs correctly", () => {
        const regimes: RegimeId[] = ["ef", "f", "n", "g", "eg"];

        for (const current of regimes) {
          for (const previous of regimes) {
            const result = computeStrategyDirection(current, previous);
            const currentOrder = REGIME_ORDER[current];
            const previousOrder = REGIME_ORDER[previous];

            if (currentOrder > previousOrder) {
              expect(result).toBe("fromLeft");
            } else if (currentOrder < previousOrder) {
              expect(result).toBe("fromRight");
            } else {
              expect(result).toBe("default");
            }
          }
        }
      });
    });
  });

  describe("getActiveStrategy", () => {
    describe("server direction preference", () => {
      it("should use server direction when fromLeft", () => {
        const result = getActiveStrategy("fromLeft", "g", "n");
        expect(result).toBe("fromLeft");
      });

      it("should use server direction when fromRight", () => {
        const result = getActiveStrategy("fromRight", "f", "g");
        expect(result).toBe("fromRight");
      });

      it("should prefer server direction over client calculation", () => {
        // Server says fromLeft, but client would calculate fromRight
        const result = getActiveStrategy("fromLeft", "f", "g");
        expect(result).toBe("fromLeft");
      });
    });

    describe("client-side fallback", () => {
      it("should compute client-side when server direction is default", () => {
        const result = getActiveStrategy("default", "g", "n");
        expect(result).toBe("fromLeft");
      });

      it("should compute client-side when server direction is undefined", () => {
        const result = getActiveStrategy(undefined, "g", "n");
        expect(result).toBe("fromLeft");
      });

      it("should compute fromRight when server provides default", () => {
        const result = getActiveStrategy("default", "f", "g");
        expect(result).toBe("fromRight");
      });

      it("should compute default when no previous regime", () => {
        const result = getActiveStrategy(undefined, "n", null);
        expect(result).toBe("default");
      });
    });

    describe("consistency with computeStrategyDirection", () => {
      it("should match client calculation when server is unavailable", () => {
        const regimes: RegimeId[] = ["ef", "f", "n", "g", "eg"];

        for (const current of regimes) {
          for (const previous of regimes) {
            const clientResult = computeStrategyDirection(current, previous);
            const activeResult = getActiveStrategy(
              undefined,
              current,
              previous
            );
            expect(activeResult).toBe(clientResult);
          }
        }
      });
    });
  });

  describe("getStrategyMeta", () => {
    describe("fromLeft metadata", () => {
      it("should return correct animation class for fromLeft", () => {
        const meta = getStrategyMeta("fromLeft");
        expect(meta.animationClass).toBe("slide-from-left");
      });

      it("should return correct aria label for fromLeft", () => {
        const meta = getStrategyMeta("fromLeft");
        expect(meta.ariaLabel).toBe(
          "Transitioning from bearish to bullish regime"
        );
      });

      it("should return correct description for fromLeft", () => {
        const meta = getStrategyMeta("fromLeft");
        expect(meta.description).toBe("Increasing crypto allocation");
      });
    });

    describe("fromRight metadata", () => {
      it("should return correct animation class for fromRight", () => {
        const meta = getStrategyMeta("fromRight");
        expect(meta.animationClass).toBe("slide-from-right");
      });

      it("should return correct aria label for fromRight", () => {
        const meta = getStrategyMeta("fromRight");
        expect(meta.ariaLabel).toBe(
          "Transitioning from bullish to bearish regime"
        );
      });

      it("should return correct description for fromRight", () => {
        const meta = getStrategyMeta("fromRight");
        expect(meta.description).toBe("Decreasing crypto allocation");
      });
    });

    describe("default metadata", () => {
      it("should return correct animation class for default", () => {
        const meta = getStrategyMeta("default");
        expect(meta.animationClass).toBe("fade-in");
      });

      it("should return correct aria label for default", () => {
        const meta = getStrategyMeta("default");
        expect(meta.ariaLabel).toBe("Current market regime");
      });

      it("should return correct description for default", () => {
        const meta = getStrategyMeta("default");
        expect(meta.description).toBe("Maintaining current allocation");
      });
    });

    describe("metadata structure", () => {
      it("should return all required fields", () => {
        const directions: DirectionType[] = [
          "fromLeft",
          "fromRight",
          "default",
        ];

        for (const direction of directions) {
          const meta = getStrategyMeta(direction);
          expect(meta).toHaveProperty("animationClass");
          expect(meta).toHaveProperty("ariaLabel");
          expect(meta).toHaveProperty("description");
          expect(typeof meta.animationClass).toBe("string");
          expect(typeof meta.ariaLabel).toBe("string");
          expect(typeof meta.description).toBe("string");
        }
      });
    });
  });

  // Tests for removed isValidRegimeId function have been deleted

  describe("getRegimeName", () => {
    it("should return correct name for ef", () => {
      expect(getRegimeName("ef")).toBe("Extreme Fear");
    });

    it("should return correct name for f", () => {
      expect(getRegimeName("f")).toBe("Fear");
    });

    it("should return correct name for n", () => {
      expect(getRegimeName("n")).toBe("Neutral");
    });

    it("should return correct name for g", () => {
      expect(getRegimeName("g")).toBe("Greed");
    });

    it("should return correct name for eg", () => {
      expect(getRegimeName("eg")).toBe("Extreme Greed");
    });

    it("should return names for all regime IDs", () => {
      const regimes: RegimeId[] = ["ef", "f", "n", "g", "eg"];
      for (const regime of regimes) {
        const name = getRegimeName(regime);
        expect(typeof name).toBe("string");
        expect(name.length).toBeGreaterThan(0);
      }
    });
  });
});
