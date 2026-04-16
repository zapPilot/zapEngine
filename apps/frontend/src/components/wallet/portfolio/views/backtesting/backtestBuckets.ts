import {
  mapAssetAllocationToUnified,
  type UnifiedCategory,
  type UnifiedSegment,
} from "@/components/wallet/portfolio/components/allocation";
import { UNIFIED_COLORS } from "@/constants/assets";
import type {
  BacktestAllocationBucket,
  BacktestAssetAllocation,
  BacktestBucket,
  BacktestPortfolioAllocation,
  BacktestSpotAssetSymbol,
  BacktestTransferMetadata,
} from "@/types/backtesting";

import { getBacktestSpotAssetColor } from "./utils/spotAssetDisplay";

interface BacktestBucketConfig {
  label: string;
  shortLabel: string;
  color: string;
}

type BacktestTransferDirection = "stable_to_spot" | "spot_to_stable";

/** Allocation buckets used for portfolio display (spot & stable). */
export const BACKTEST_BUCKETS = [
  "spot",
  "stable",
] as const satisfies readonly BacktestAllocationBucket[];

const BACKTEST_BUCKET_CONFIG: Record<
  BacktestAllocationBucket,
  BacktestBucketConfig
> = {
  spot: {
    label: "Spot",
    shortLabel: "SPOT",
    color: getBacktestSpotAssetColor("BTC"),
  },
  stable: {
    label: "Stable",
    shortLabel: "STABLE",
    color: UNIFIED_COLORS.STABLE,
  },
};

const ALL_BUCKET_VALUES: readonly string[] = [
  ...BACKTEST_BUCKETS,
  "eth",
  "btc",
  "alt",
];

export function isBacktestBucket(value: unknown): value is BacktestBucket {
  return typeof value === "string" && ALL_BUCKET_VALUES.includes(value);
}

export function isBacktestTransfer(
  value: unknown
): value is BacktestTransferMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const transfer = value as Partial<BacktestTransferMetadata>;

  return (
    isBacktestBucket(transfer.from_bucket) &&
    isBacktestBucket(transfer.to_bucket) &&
    typeof transfer.amount_usd === "number"
  );
}

export function hasBacktestAllocation(
  allocation: BacktestPortfolioAllocation
): boolean {
  return BACKTEST_BUCKETS.some(bucket => allocation[bucket] > 0);
}

export function buildBacktestAllocationSegments(
  allocation: BacktestPortfolioAllocation,
  spotAssetLabel?: BacktestSpotAssetSymbol,
  assetAllocation?: BacktestAssetAllocation | null
): UnifiedSegment[] {
  if (assetAllocation) {
    const explicitSegments = mapAssetAllocationToUnified(assetAllocation);

    if (explicitSegments.length > 0) {
      return explicitSegments;
    }
  }

  return BACKTEST_BUCKETS.map(bucket => {
    const config = BACKTEST_BUCKET_CONFIG[bucket];
    const segmentCategory: UnifiedCategory =
      bucket === "spot" ? (spotAssetLabel === "ETH" ? "eth" : "btc") : "stable";
    const segmentLabel =
      bucket === "spot"
        ? (spotAssetLabel ?? config.shortLabel)
        : config.shortLabel;
    const segmentColor =
      bucket === "spot" && spotAssetLabel
        ? getBacktestSpotAssetColor(spotAssetLabel)
        : config.color;

    return {
      category: segmentCategory,
      label: segmentLabel,
      percentage: allocation[bucket] * 100,
      color: segmentColor,
    };
  }).filter(segment => segment.percentage > 0);
}

function isSpotBucket(bucket: BacktestBucket): boolean {
  return (
    bucket === "spot" ||
    bucket === "eth" ||
    bucket === "btc" ||
    bucket === "alt"
  );
}

export function getBacktestTransferDirection(
  fromBucket: BacktestBucket,
  toBucket: BacktestBucket
): BacktestTransferDirection | null {
  if (fromBucket === "stable" && isSpotBucket(toBucket)) {
    return "stable_to_spot";
  }

  if (isSpotBucket(fromBucket) && toBucket === "stable") {
    return "spot_to_stable";
  }

  return null;
}
