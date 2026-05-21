import { describe, expect, it } from 'vitest';

import {
  BucketSchema,
  BucketTransferSchema,
} from '../../../src/strategy/bucket.js';

describe('BucketSchema', () => {
  it('accepts each of the five tradeable bucket identifiers', () => {
    for (const bucket of ['spot', 'stable', 'btc', 'eth', 'spy']) {
      expect(BucketSchema.safeParse(bucket).success).toBe(true);
    }
  });

  it('rejects unknown bucket names (catches accidental drift)', () => {
    expect(BucketSchema.safeParse('alt').success).toBe(false);
    expect(BucketSchema.safeParse('').success).toBe(false);
    expect(BucketSchema.safeParse('BTC').success).toBe(false); // case sensitive
  });

  it('rejects non-string inputs', () => {
    expect(BucketSchema.safeParse(0).success).toBe(false);
    expect(BucketSchema.safeParse(null).success).toBe(false);
    expect(BucketSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('BucketTransferSchema', () => {
  it('accepts a valid transfer between buckets', () => {
    const result = BucketTransferSchema.safeParse({
      from_bucket: 'stable',
      to_bucket: 'btc',
      amount_usd: 1000,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a zero-amount transfer', () => {
    expect(
      BucketTransferSchema.safeParse({
        from_bucket: 'stable',
        to_bucket: 'stable',
        amount_usd: 0,
      }).success,
    ).toBe(true);
  });

  it('rejects a negative amount', () => {
    expect(
      BucketTransferSchema.safeParse({
        from_bucket: 'stable',
        to_bucket: 'btc',
        amount_usd: -1,
      }).success,
    ).toBe(false);
  });

  it('rejects when from_bucket is not in the enum', () => {
    expect(
      BucketTransferSchema.safeParse({
        from_bucket: 'gold',
        to_bucket: 'btc',
        amount_usd: 10,
      }).success,
    ).toBe(false);
  });
});
