import {
  mapAssetAllocationToUnified,
  type UnifiedSegment,
} from '@/components/wallet/portfolio/components/allocation';
import type {
  BacktestBucket,
  BacktestPortfolioAllocation,
  BacktestTransferMetadata,
} from '@/types/backtesting';

type BacktestTransferDirection = 'stable_to_spot' | 'spot_to_stable';

const BACKTEST_ALLOCATION_BUCKETS = [
  'btc',
  'eth',
  'spy',
  'stable',
  'alt',
] as const satisfies readonly (keyof BacktestPortfolioAllocation)[];

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
  allocation: BacktestPortfolioAllocation,
): boolean {
  return BACKTEST_ALLOCATION_BUCKETS.some((bucket) => allocation[bucket] > 0);
}

export function buildBacktestAllocationSegments(
  allocation: BacktestPortfolioAllocation,
): UnifiedSegment[] {
  return mapAssetAllocationToUnified(allocation);
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
