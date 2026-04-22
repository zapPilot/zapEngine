import type { RegimeAllocationBreakdown } from '@/types/domain/allocation';

export type InvestAllocationBucket = keyof RegimeAllocationBreakdown;

export type InvestAllocationValueMap = Record<InvestAllocationBucket, number>;

interface InvestAllocationBucketConfig {
  label: string;
  shortLabel: string;
  progressLabel: string;
  dotClass: string;
  currentClass: string;
  targetClass: string;
  progressColor: string;
}

export interface InvestAllocationEntry extends InvestAllocationBucketConfig {
  key: InvestAllocationBucket;
  value: number;
}

export interface InvestAllocationComparisonEntry extends InvestAllocationBucketConfig {
  key: InvestAllocationBucket;
  current: number;
  target: number;
}

export interface InvestCompositionTarget {
  crypto: number;
  stable: number;
}

export const EMPTY_INVEST_ALLOCATION: RegimeAllocationBreakdown = {
  spot: 0,
  stable: 0,
};

export const INVEST_ALLOCATION_BUCKETS = [
  'spot',
  'stable',
] as const satisfies readonly InvestAllocationBucket[];

const INVEST_ALLOCATION_BUCKET_CONFIG: Record<
  InvestAllocationBucket,
  InvestAllocationBucketConfig
> = {
  spot: {
    label: 'Spot',
    shortLabel: 'SPOT',
    progressLabel: 'Target Spot',
    dotClass: 'bg-orange-500',
    currentClass:
      'bg-orange-500/80 w-full relative group/segment flex items-center justify-center transition-all hover:bg-orange-500',
    targetClass:
      'bg-orange-500 w-full relative group/segment flex items-center justify-center',
    progressColor: 'orange-500',
  },
  stable: {
    label: 'Stable',
    shortLabel: 'STABLE',
    progressLabel: 'Target Stable',
    dotClass: 'bg-emerald-500',
    currentClass:
      'bg-emerald-500/80 w-full relative group/segment flex items-center justify-center transition-all hover:bg-emerald-500',
    targetClass:
      'bg-emerald-500 w-full relative group/segment flex items-center justify-center',
    progressColor: 'emerald-500',
  },
};

export function buildInvestAllocationEntries(
  allocation: InvestAllocationValueMap,
): InvestAllocationEntry[] {
  return INVEST_ALLOCATION_BUCKETS.map((bucket) => ({
    key: bucket,
    value: allocation[bucket],
    ...INVEST_ALLOCATION_BUCKET_CONFIG[bucket],
  }));
}

export function buildInvestAllocationComparison(
  current: InvestAllocationValueMap,
  target: InvestAllocationValueMap,
): InvestAllocationComparisonEntry[] {
  return INVEST_ALLOCATION_BUCKETS.map((bucket) => ({
    key: bucket,
    current: current[bucket],
    target: target[bucket],
    ...INVEST_ALLOCATION_BUCKET_CONFIG[bucket],
  }));
}

export function toInvestCompositionTarget(
  allocation: RegimeAllocationBreakdown,
): InvestCompositionTarget {
  return {
    crypto: allocation.spot,
    stable: allocation.stable,
  };
}
