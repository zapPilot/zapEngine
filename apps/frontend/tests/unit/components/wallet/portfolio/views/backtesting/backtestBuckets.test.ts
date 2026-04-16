import { describe, expect, it } from "vitest";

import {
  BACKTEST_BUCKETS,
  buildBacktestAllocationSegments,
  getBacktestTransferDirection,
  hasBacktestAllocation,
  isBacktestBucket,
  isBacktestTransfer,
} from "@/components/wallet/portfolio/views/backtesting/backtestBuckets";

describe("backtestBuckets", () => {
  it("defines the canonical two-bucket order", () => {
    expect(BACKTEST_BUCKETS).toEqual(["spot", "stable"]);
  });

  it("recognizes valid buckets only", () => {
    expect(isBacktestBucket("spot")).toBe(true);
    expect(isBacktestBucket("stable")).toBe(true);
    expect(isBacktestBucket("eth")).toBe(true);
    expect(isBacktestBucket("btc")).toBe(true);
    expect(isBacktestBucket("lp")).toBe(false);
  });

  it("validates two-bucket transfers only", () => {
    expect(
      isBacktestTransfer({
        from_bucket: "stable",
        to_bucket: "spot",
        amount_usd: 100,
      })
    ).toBe(true);

    expect(
      isBacktestTransfer({
        from_bucket: "stable",
        to_bucket: "lp",
        amount_usd: 100,
      })
    ).toBe(false);
  });

  it("accepts eth and btc as valid transfer buckets", () => {
    expect(
      isBacktestTransfer({
        from_bucket: "stable",
        to_bucket: "eth",
        amount_usd: 100,
      })
    ).toBe(true);

    expect(
      isBacktestTransfer({
        from_bucket: "btc",
        to_bucket: "stable",
        amount_usd: 50,
      })
    ).toBe(true);
  });

  it("maps allocation ratios to UI segments", () => {
    expect(
      buildBacktestAllocationSegments({
        spot: 0.6,
        stable: 0.4,
      })
    ).toEqual([
      {
        category: "btc",
        label: "SPOT",
        percentage: 60,
        color: "#F7931A",
      },
      {
        category: "stable",
        label: "STABLE",
        percentage: 40,
        color: "#2775CA",
      },
    ]);
  });

  it("uses the provided spot asset label and shared ETH color", () => {
    expect(
      buildBacktestAllocationSegments(
        {
          spot: 0.6,
          stable: 0.4,
        },
        "ETH"
      )
    ).toEqual([
      {
        category: "eth",
        label: "ETH",
        percentage: 60,
        color: "#627EEA",
      },
      {
        category: "stable",
        label: "STABLE",
        percentage: 40,
        color: "#2775CA",
      },
    ]);
  });

  it("uses shared BTC color for BTC spot asset label", () => {
    expect(
      buildBacktestAllocationSegments(
        {
          spot: 0.7,
          stable: 0.3,
        },
        "BTC"
      )
    ).toEqual([
      {
        category: "btc",
        label: "BTC",
        percentage: 70,
        color: "#F7931A",
      },
      {
        category: "stable",
        label: "STABLE",
        percentage: 30,
        color: "#2775CA",
      },
    ]);
  });

  it("keeps default shared BTC color when no spotAssetLabel is provided", () => {
    const segments = buildBacktestAllocationSegments({
      spot: 0.5,
      stable: 0.5,
    });
    const spotSegment = segments.find(s => s.label === "SPOT");
    expect(spotSegment?.color).toBe("#F7931A");
  });

  it("prefers explicit asset allocation when available", () => {
    const segments = buildBacktestAllocationSegments(
      { spot: 0.7, stable: 0.3 },
      "BTC",
      {
        btc: 0.4,
        eth: 0.2,
        stable: 0.3,
        alt: 0.1,
      }
    );

    expect(segments).toEqual([
      {
        category: "btc",
        label: "BTC",
        percentage: 40,
        color: "#F7931A",
      },
      {
        category: "stable",
        label: "STABLE",
        percentage: 30,
        color: "#2775CA",
      },
      {
        category: "eth",
        label: "ETH",
        percentage: 20,
        color: "#627EEA",
      },
      {
        category: "alt",
        label: "ALT",
        percentage: 10,
        color: "#6B7280",
      },
    ]);
  });

  it("treats zero allocation as empty and classifies supported directions", () => {
    expect(hasBacktestAllocation({ spot: 0, stable: 0 })).toBe(false);
    expect(getBacktestTransferDirection("stable", "spot")).toBe(
      "stable_to_spot"
    );
    expect(getBacktestTransferDirection("spot", "stable")).toBe(
      "spot_to_stable"
    );
  });

  it("treats eth and btc buckets as spot for transfer direction", () => {
    expect(getBacktestTransferDirection("stable", "eth")).toBe(
      "stable_to_spot"
    );
    expect(getBacktestTransferDirection("stable", "btc")).toBe(
      "stable_to_spot"
    );
    expect(getBacktestTransferDirection("eth", "stable")).toBe(
      "spot_to_stable"
    );
    expect(getBacktestTransferDirection("btc", "stable")).toBe(
      "spot_to_stable"
    );
  });

  it("returns null for spot-to-spot transfers (eth/btc rotation handled at chart level)", () => {
    expect(getBacktestTransferDirection("eth", "btc")).toBeNull();
    expect(getBacktestTransferDirection("btc", "eth")).toBeNull();
  });
});
