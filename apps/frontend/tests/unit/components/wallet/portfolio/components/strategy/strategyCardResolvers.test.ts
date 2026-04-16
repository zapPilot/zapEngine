import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WalletPortfolioDataWithDirection } from "@/adapters/walletPortfolioDataAdapter";
import {
  determineActiveDirection,
  findRegimeById,
  resolveDisplayRegime,
  resolveEffectiveRegime,
  resolveTargetAllocation,
} from "@/components/wallet/portfolio/components/strategy/strategyCardResolvers";
import {
  getRegimeAllocation,
  type Regime,
  regimes,
  type RegimeStrategy,
} from "@/components/wallet/regime/regimeData";
import { getRegimeFromStatus } from "@/lib/domain/regimeMapper";
import type {
  SectionState,
  SentimentData,
} from "@/types/portfolio-progressive";

vi.mock("@/components/wallet/regime/regimeData", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/wallet/regime/regimeData")
  >("@/components/wallet/regime/regimeData");
  return {
    ...actual,
    getRegimeAllocation: vi.fn(),
  };
});

vi.mock("@/lib/domain/regimeMapper", () => ({
  getRegimeFromStatus: vi.fn(),
}));

const mockGetRegimeAllocation = vi.mocked(getRegimeAllocation);
const mockGetRegimeFromStatus = vi.mocked(getRegimeFromStatus);

describe("strategyCardResolvers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findRegimeById", () => {
    it("returns undefined when regimeId is null", () => {
      const result = findRegimeById(null);
      expect(result).toBeUndefined();
    });

    it("returns undefined when regimeId is undefined", () => {
      const result = findRegimeById(undefined);
      expect(result).toBeUndefined();
    });

    it("returns regime when valid id is provided", () => {
      const result = findRegimeById("ef");
      expect(result).toBeDefined();
      expect(result?.id).toBe("ef");
    });

    it("returns undefined when regime id does not exist", () => {
      const result = findRegimeById("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("resolveEffectiveRegime", () => {
    it("returns currentRegime when provided", () => {
      const currentRegime = regimes[0];
      const sentimentSection: SectionState<SentimentData> = {
        status: "loaded",
        data: { status: "greed" },
      };

      const result = resolveEffectiveRegime(currentRegime, sentimentSection);
      expect(result).toBe(currentRegime);
    });

    it("returns derived regime when currentRegime is undefined and sentimentSection has data", () => {
      mockGetRegimeFromStatus.mockReturnValue("f");

      const sentimentSection: SectionState<SentimentData> = {
        status: "loaded",
        data: { status: "fear" },
      };

      const result = resolveEffectiveRegime(undefined, sentimentSection);
      expect(mockGetRegimeFromStatus).toHaveBeenCalledWith("fear");
      expect(result).toBeDefined();
      expect(result?.id).toBe("f");
    });

    it("returns undefined when both currentRegime and sentimentSection data are undefined", () => {
      const result = resolveEffectiveRegime(undefined, undefined);
      expect(result).toBeUndefined();
    });

    it("returns undefined when sentimentSection has no data", () => {
      const sentimentSection: SectionState<SentimentData> = {
        status: "loading",
        data: undefined,
      };

      const result = resolveEffectiveRegime(undefined, sentimentSection);
      expect(result).toBeUndefined();
    });
  });

  describe("resolveDisplayRegime", () => {
    it("returns regime from selectedRegimeId when found", () => {
      const effectiveRegime = regimes[0];
      const result = resolveDisplayRegime("f", effectiveRegime);
      expect(result?.id).toBe("f");
    });

    it("falls back to effectiveRegime when selectedRegimeId is null", () => {
      const effectiveRegime = regimes[0];
      const result = resolveDisplayRegime(null, effectiveRegime);
      expect(result).toBe(effectiveRegime);
    });

    it("returns undefined when both selectedRegimeId and effectiveRegime are invalid", () => {
      const result = resolveDisplayRegime(null, undefined);
      expect(result).toBeUndefined();
    });
  });

  describe("determineActiveDirection", () => {
    it("returns default when displayRegime is undefined", () => {
      const data: WalletPortfolioDataWithDirection = {
        strategyDirection: "fromLeft",
      } as WalletPortfolioDataWithDirection;

      const result = determineActiveDirection(undefined, null, false, data);
      expect(result).toBe("default");
    });

    it("returns selectedDirection when it exists and regime has that strategy", () => {
      const displayRegime = regimes.find(r => r.id === "f");
      const data: WalletPortfolioDataWithDirection = {
        strategyDirection: "default",
      } as WalletPortfolioDataWithDirection;

      const result = determineActiveDirection(
        displayRegime,
        "fromLeft",
        false,
        data
      );
      expect(result).toBe("fromLeft");
    });

    it("returns data.strategyDirection when isViewingCurrent is true and strategyDirection is not default", () => {
      const displayRegime = regimes.find(r => r.id === "f");
      const data: WalletPortfolioDataWithDirection = {
        strategyDirection: "fromLeft",
      } as WalletPortfolioDataWithDirection;

      const result = determineActiveDirection(displayRegime, null, true, data);
      expect(result).toBe("fromLeft");
    });

    it("returns fromLeft when regime has fromLeft strategy and no other direction matches", () => {
      const displayRegime = regimes.find(r => r.id === "f");
      const data: WalletPortfolioDataWithDirection = {
        strategyDirection: "default",
      } as WalletPortfolioDataWithDirection;

      const result = determineActiveDirection(displayRegime, null, false, data);
      expect(result).toBe("fromLeft");
    });

    it("returns fromRight when regime has only fromRight strategy", () => {
      const mockRegimeWithOnlyFromRight: Regime = {
        id: "g",
        label: "Greed",
        fillColor: "#f97316",
        visual: {
          badge: "bg-orange-500/20 text-orange-400 border-orange-500/30",
          gradient: "from-orange-400 to-red-500",
          icon: null as never,
        },
        strategies: {
          fromRight: {
            philosophy: "Test philosophy",
            author: "Test author",
          },
        },
      };

      const data: WalletPortfolioDataWithDirection = {
        strategyDirection: "default",
      } as WalletPortfolioDataWithDirection;

      const result = determineActiveDirection(
        mockRegimeWithOnlyFromRight,
        null,
        false,
        data
      );
      expect(result).toBe("fromRight");
    });

    it("returns default when regime has no matching strategies", () => {
      const mockRegimeWithDefaultOnly: Regime = {
        id: "ef",
        label: "Extreme Fear",
        fillColor: "#22c55e",
        visual: {
          badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
          gradient: "from-emerald-400 to-green-500",
          icon: null as never,
        },
        strategies: {
          default: {
            philosophy: "Test philosophy",
            author: "Test author",
          },
        },
      };

      const data: WalletPortfolioDataWithDirection = {
        strategyDirection: "default",
      } as WalletPortfolioDataWithDirection;

      const result = determineActiveDirection(
        mockRegimeWithDefaultOnly,
        null,
        false,
        data
      );
      expect(result).toBe("default");
    });

    it("does not return data.strategyDirection when isViewingCurrent is false", () => {
      const displayRegime = regimes.find(r => r.id === "f");
      const data: WalletPortfolioDataWithDirection = {
        strategyDirection: "fromRight",
      } as WalletPortfolioDataWithDirection;

      const result = determineActiveDirection(displayRegime, null, false, data);
      expect(result).not.toBe("fromRight");
      expect(result).toBe("fromLeft");
    });

    it("does not return data.strategyDirection when strategyDirection is default", () => {
      const displayRegime = regimes.find(r => r.id === "f");
      const data: WalletPortfolioDataWithDirection = {
        strategyDirection: "default",
      } as WalletPortfolioDataWithDirection;

      const result = determineActiveDirection(displayRegime, null, true, data);
      expect(result).toBe("fromLeft");
    });
  });

  describe("resolveTargetAllocation", () => {
    it("returns allocationAfter when activeStrategy has useCase with allocationAfter", () => {
      const activeStrategy: RegimeStrategy = {
        philosophy: "Test philosophy",
        author: "Test author",
        useCase: {
          scenario: "Test scenario",
          userIntent: "Test intent",
          zapAction: "Test action",
          allocationBefore: { spot: 30, stable: 70 },
          allocationAfter: { spot: 70, stable: 30 },
        },
      };

      const result = resolveTargetAllocation(activeStrategy, undefined);
      expect(result).toEqual({ spot: 70, stable: 30 });
    });

    it("calls getRegimeAllocation when activeStrategy is undefined and displayRegime exists", () => {
      const displayRegime = regimes[0];
      mockGetRegimeAllocation.mockReturnValue({ spot: 60, stable: 40 });

      const result = resolveTargetAllocation(undefined, displayRegime);
      expect(mockGetRegimeAllocation).toHaveBeenCalledWith(displayRegime);
      expect(result).toEqual({ spot: 60, stable: 40 });
    });

    it("returns zero allocation when both activeStrategy and displayRegime are undefined", () => {
      const result = resolveTargetAllocation(undefined, undefined);
      expect(result).toEqual({ spot: 0, stable: 0 });
    });

    it("returns zero allocation when activeStrategy has no useCase", () => {
      const activeStrategy: RegimeStrategy = {
        philosophy: "Test philosophy",
        author: "Test author",
      };

      mockGetRegimeAllocation.mockReturnValue({ spot: 50, stable: 50 });
      const displayRegime = regimes[0];

      const result = resolveTargetAllocation(activeStrategy, displayRegime);
      expect(mockGetRegimeAllocation).toHaveBeenCalledWith(displayRegime);
      expect(result).toEqual({ spot: 50, stable: 50 });
    });

    it("returns zero allocation when activeStrategy.useCase has no allocationAfter and no displayRegime", () => {
      const activeStrategy: RegimeStrategy = {
        philosophy: "Test philosophy",
        author: "Test author",
        useCase: {
          scenario: "Test scenario",
          userIntent: "Test intent",
          zapAction: "Test action",
          allocationBefore: { spot: 30, stable: 70 },
          allocationAfter: { spot: 0, stable: 0 },
        },
      };

      const result = resolveTargetAllocation(activeStrategy, undefined);
      expect(result).toEqual({ spot: 0, stable: 0 });
    });
  });
});
