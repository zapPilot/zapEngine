import { describe, expect, it } from "vitest";

import {
  getBacktestSpotAssetColor,
  resolveBacktestSpotAsset,
} from "@/components/wallet/portfolio/views/backtesting/utils/spotAssetDisplay";

function makeStrategy(overrides: {
  spot?: number;
  stable?: number;
  spotAsset?: unknown;
  targetSpotAsset?: unknown;
}) {
  return {
    portfolio: {
      spot_usd: overrides.spot ?? 5000,
      stable_usd: overrides.stable ?? 5000,
      total_value: (overrides.spot ?? 5000) + (overrides.stable ?? 5000),
      allocation: {
        spot: overrides.spot ?? 5000,
        stable: overrides.stable ?? 5000,
      },
      ...(overrides.spotAsset !== undefined
        ? { spot_asset: overrides.spotAsset }
        : {}),
    },
    decision: {
      action: "hold",
      reason: "test",
      details: {
        ...(overrides.targetSpotAsset !== undefined
          ? { target_spot_asset: overrides.targetSpotAsset }
          : {}),
      },
    },
  };
}

describe("getBacktestSpotAssetColor", () => {
  it("returns the BTC chart color", () => {
    expect(getBacktestSpotAssetColor("BTC")).toBe("#F7931A");
  });

  it("returns the ETH chart color", () => {
    expect(getBacktestSpotAssetColor("ETH")).toBe("#627EEA");
  });
});

describe("resolveBacktestSpotAsset", () => {
  it("returns null when strategy is null", () => {
    expect(resolveBacktestSpotAsset(null)).toBeNull();
  });

  it("returns null when strategy is undefined", () => {
    expect(resolveBacktestSpotAsset(undefined)).toBeNull();
  });

  it("returns null when spot allocation is zero (stable-only position)", () => {
    const strategy = makeStrategy({ spot: 0, stable: 10000, spotAsset: "BTC" });
    expect(resolveBacktestSpotAsset(strategy as any)).toBeNull();
  });

  it("returns BTC when portfolio.spot_asset is BTC", () => {
    const strategy = makeStrategy({ spot: 5000, spotAsset: "BTC" });
    expect(resolveBacktestSpotAsset(strategy as any)).toBe("BTC");
  });

  it("normalizes whitespace and case for portfolio.spot_asset", () => {
    const strategy = makeStrategy({ spot: 5000, spotAsset: " eth " });
    expect(resolveBacktestSpotAsset(strategy as any)).toBe("ETH");
  });

  it("falls back to decision.details.target_spot_asset when portfolio.spot_asset is absent", () => {
    const strategy = makeStrategy({ spot: 5000, targetSpotAsset: "btc" });
    expect(resolveBacktestSpotAsset(strategy as any)).toBe("BTC");
  });

  it("returns null when both sources are absent", () => {
    const strategy = makeStrategy({ spot: 5000 });
    expect(resolveBacktestSpotAsset(strategy as any)).toBeNull();
  });

  it("returns null when portfolio.spot_asset is a non-string value", () => {
    const strategy = makeStrategy({ spot: 5000, spotAsset: 42 });
    expect(resolveBacktestSpotAsset(strategy as any)).toBeNull();
  });

  it("returns null for unsupported asset symbol", () => {
    const strategy = makeStrategy({ spot: 5000, spotAsset: "SOL" });
    expect(resolveBacktestSpotAsset(strategy as any)).toBeNull();
  });

  it("prefers portfolio.spot_asset over decision fallback", () => {
    const strategy = makeStrategy({
      spot: 5000,
      spotAsset: "ETH",
      targetSpotAsset: "btc",
    });
    expect(resolveBacktestSpotAsset(strategy as any)).toBe("ETH");
  });
});
