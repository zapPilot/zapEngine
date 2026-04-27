import { z } from 'zod';

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
