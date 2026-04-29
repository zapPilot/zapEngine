import {
  mapAssetAllocationToUnified,
  type UnifiedSegment,
} from '@/components/wallet/portfolio/components/allocation';
import type {
  BacktestAssetAllocation,
  BacktestBucket,
  BacktestStrategyPoint,
  BacktestTransferMetadata,
} from '@/types/backtesting';

type BacktestTransferDirection = 'stable_to_spot' | 'spot_to_stable';

const BACKTEST_ALLOCATION_BUCKETS = [
  'btc',
  'eth',
  'spy',
  'stable',
  'alt',
] as const satisfies readonly (keyof BacktestAssetAllocation)[];

const ALL_BUCKET_VALUES: readonly string[] = [
  'spot',
  'stable',
  'btc',
  'eth',
  'spy',
];

export function isBacktestBucket(value: unknown): value is BacktestBucket {
  return typeof value === 'string' && ALL_BUCKET_VALUES.includes(value);
}

export function isBacktestTransfer(
  value: unknown,
): value is BacktestTransferMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const transfer = value as Partial<BacktestTransferMetadata>;

  return (
    isBacktestBucket(transfer.from_bucket) &&
    isBacktestBucket(transfer.to_bucket) &&
    typeof transfer.amount_usd === 'number'
  );
}

export function hasBacktestAllocation(
  allocation: BacktestAssetAllocation,
): boolean {
  return BACKTEST_ALLOCATION_BUCKETS.some((bucket) => allocation[bucket] > 0);
}

export function buildBacktestAllocationSegments(
  allocation: BacktestAssetAllocation,
): UnifiedSegment[] {
  return mapAssetAllocationToUnified(allocation);
}

function isAssetAllocation(
  allocation: unknown,
): allocation is BacktestAssetAllocation {
  if (!allocation || typeof allocation !== 'object') {
    return false;
  }

  const maybeAllocation = allocation as Partial<BacktestAssetAllocation>;
  return BACKTEST_ALLOCATION_BUCKETS.every(
    (bucket) => typeof maybeAllocation[bucket] === 'number',
  );
}

export function resolveBacktestDisplayAllocation(
  strategy: BacktestStrategyPoint,
): BacktestAssetAllocation | null {
  if (isAssetAllocation(strategy.portfolio.asset_allocation)) {
    return strategy.portfolio.asset_allocation;
  }

  if (isAssetAllocation(strategy.portfolio.allocation)) {
    return strategy.portfolio.allocation;
  }

  const legacyAllocation = strategy.portfolio.allocation as {
    spot?: number;
    stable?: number;
  };
  const spot = legacyAllocation.spot ?? 0;
  const stable = legacyAllocation.stable ?? 0;

  if (spot <= 0 && stable <= 0) {
    return null;
  }

  return {
    btc:
      strategy.portfolio.spot_asset === 'ETH' ||
      strategy.portfolio.spot_asset === 'SPY'
        ? 0
        : spot,
    eth: strategy.portfolio.spot_asset === 'ETH' ? spot : 0,
    spy: strategy.portfolio.spot_asset === 'SPY' ? spot : 0,
    stable,
    alt: 0,
  };
}

function isSpotBucket(bucket: BacktestBucket): boolean {
  return (
    bucket === 'spot' ||
    bucket === 'eth' ||
    bucket === 'btc' ||
    bucket === 'spy'
  );
}

export function getBacktestTransferDirection(
  fromBucket: BacktestBucket,
  toBucket: BacktestBucket,
): BacktestTransferDirection | null {
  if (fromBucket === 'stable' && isSpotBucket(toBucket)) {
    return 'stable_to_spot';
  }

  if (isSpotBucket(fromBucket) && toBucket === 'stable') {
    return 'spot_to_stable';
  }

  return null;
}
