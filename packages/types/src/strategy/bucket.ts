import { z } from 'zod';

/**
 * BucketSchema defines the tradeable asset buckets for portfolio allocation.
 * Note: 'alt' is used internally in backtesting (target_allocation.py TARGET_ASSET_KEYS)
 * but is not a tradeable bucket - it represents non-tradeable assets and must be 0 in targets.
 * Transfer operations only involve 4 tradeable assets: btc, eth, spy, stable.
 */
export const BucketSchema = z.enum(['spot', 'stable', 'btc', 'eth', 'spy']);

export const BucketTransferSchema = z.object({
  from_bucket: BucketSchema,
  to_bucket: BucketSchema,
  amount_usd: z.number().nonnegative(),
});

export type Bucket = z.infer<typeof BucketSchema>;
export type BucketTransfer = z.infer<typeof BucketTransferSchema>;

export type BacktestAllocationBucket = Extract<Bucket, 'spot' | 'stable'>;
export type BacktestBucket = Bucket;
export type BacktestTransferMetadata = BucketTransfer;
export type TransferMetadata = BucketTransfer;
