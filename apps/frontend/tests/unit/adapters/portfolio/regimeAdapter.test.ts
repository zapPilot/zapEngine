/**
 * regimeAdapter Unit Tests
 *
 * Tests for regime allocation and strategy info derivation
 */

import { describe, expect, it, vi } from "vitest";

import {
  getRegimeStrategyInfo,
  getTargetAllocation,
} from "@/adapters/portfolio/regimeAdapter";
import type { RegimeHistoryData } from "@/services/regimeHistoryService";

// Mock dependencies
vi.mock("@/components/wallet/regime/regimeData", () => ({
  regimes: [
    { id: "quad1", name: "Quad 1" },
    { id: "quad2", name: "Quad 2" },
    { id: "quad3", name: "Quad 3" },
    { id: "quad4", name: "Quad 4" },
  ],
  getRegimeAllocation: vi.fn((regime: { id: string }) => {
    const allocations: Record<string, { spot: number; stable: number }> = {
      quad1: { spot: 70, stable: 30 },
      quad2: { spot: 50, stable: 50 },
      quad3: { spot: 30, stable: 70 },
      quad4: { spot: 45, stable: 55 },
    };
    return allocations[regime.id] || { spot: 50, stable: 50 };
  }),
}));

vi.mock("@/lib/domain/strategySelector", () => ({
  getActiveStrategy: vi.fn(
    (direction: string, _current: string, _previous: string | null) => {
      if (direction === "improving") {
        return "risk-on";
      }

      return "risk-off";
    }
  ),
}));

describe("getTargetAllocation", () => {
  it("should return correct allocation for quad1", () => {
    const result = getTargetAllocation("quad1");
    expect(result.crypto).toBe(70);
    expect(result.stable).toBe(30);
  });

  it("should return correct allocation for quad2", () => {
    const result = getTargetAllocation("quad2");
    expect(result.crypto).toBe(50);
    expect(result.stable).toBe(50);
  });

  it("should return correct allocation for quad3", () => {
    const result = getTargetAllocation("quad3");
    expect(result.crypto).toBe(30);
    expect(result.stable).toBe(70);
  });

  it("should return correct allocation for quad4", () => {
    const result = getTargetAllocation("quad4");
    expect(result.crypto).toBe(45);
    expect(result.stable).toBe(55);
  });

  it("should return neutral allocation (50/50) for unknown regime", () => {
    const result = getTargetAllocation("unknown-regime" as "quad1");
    expect(result.crypto).toBe(50);
    expect(result.stable).toBe(50);
  });
});

describe("getRegimeStrategyInfo", () => {
  it("should return default values when regimeHistoryData is null", () => {
    const result = getRegimeStrategyInfo(null);

    expect(result.previousRegime).toBeNull();
    expect(result.strategyDirection).toBe("default");
    expect(result.regimeDuration).toBeNull();
  });

  it("should derive strategy info from regime history data", () => {
    const mockData: RegimeHistoryData = {
      currentRegime: "quad1",
      previousRegime: "quad4",
      direction: "improving",
      duration: { days: 30, regime: "quad1" },
    };

    const result = getRegimeStrategyInfo(mockData);

    expect(result.previousRegime).toBe("quad4");
    expect(result.strategyDirection).toBe("risk-on");
    expect(result.regimeDuration).toEqual({ days: 30, regime: "quad1" });
  });

  it("should handle risk-off direction", () => {
    const mockData: RegimeHistoryData = {
      currentRegime: "quad3",
      previousRegime: "quad2",
      direction: "worsening",
      duration: { days: 15, regime: "quad3" },
    };

    const result = getRegimeStrategyInfo(mockData);

    expect(result.previousRegime).toBe("quad2");
    expect(result.strategyDirection).toBe("risk-off");
    expect(result.regimeDuration).toEqual({ days: 15, regime: "quad3" });
  });

  it("should handle null previousRegime in history data", () => {
    const mockData: RegimeHistoryData = {
      currentRegime: "quad1",
      previousRegime: null,
      direction: "stable",
      duration: null,
    };

    const result = getRegimeStrategyInfo(mockData);

    expect(result.previousRegime).toBeNull();
    expect(result.regimeDuration).toBeNull();
  });
});
