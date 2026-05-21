import { describe, expect, it } from 'vitest';

import {
  AssetAllocationSchema,
  PortfolioAllocationSchema,
  TargetAllocationSchema,
} from '../../../src/strategy/allocation.js';

describe('AssetAllocationSchema', () => {
  it('accepts a fully-specified allocation summing to anything in [0,1] per bucket', () => {
    const result = AssetAllocationSchema.safeParse({
      btc: 0.2,
      eth: 0.3,
      spy: 0.1,
      stable: 0.3,
      alt: 0.1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a negative weight on any bucket', () => {
    const result = AssetAllocationSchema.safeParse({
      btc: -0.1,
      eth: 0,
      spy: 0,
      stable: 1.1,
      alt: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a weight greater than 1', () => {
    const result = AssetAllocationSchema.safeParse({
      btc: 1.5,
      eth: 0,
      spy: 0,
      stable: 0,
      alt: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects when a required bucket is missing', () => {
    const result = AssetAllocationSchema.safeParse({
      btc: 0.2,
      eth: 0.3,
      spy: 0.1,
      // missing `stable`
      alt: 0.1,
    });
    expect(result.success).toBe(false);
  });
});

describe('PortfolioAllocationSchema', () => {
  it('accepts a valid spot/stable split', () => {
    expect(
      PortfolioAllocationSchema.safeParse({ spot: 0.8, stable: 0.2 }).success,
    ).toBe(true);
  });

  it('rejects negative weights', () => {
    expect(
      PortfolioAllocationSchema.safeParse({ spot: -0.1, stable: 1.1 }).success,
    ).toBe(false);
  });
});

describe('TargetAllocationSchema (strict + alt must be 0)', () => {
  it('accepts a target allocation with alt = 0', () => {
    const result = TargetAllocationSchema.safeParse({
      btc: 0.3,
      eth: 0.3,
      spy: 0.2,
      stable: 0.2,
      alt: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a target allocation with alt > 0 and pins the error path', () => {
    const result = TargetAllocationSchema.safeParse({
      btc: 0.3,
      eth: 0.3,
      spy: 0.2,
      stable: 0.1,
      alt: 0.1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const altIssue = result.error.issues.find(
        (issue) => issue.path[0] === 'alt',
      );
      expect(altIssue?.message).toContain('alt');
    }
  });

  it('rejects extra keys (strict mode)', () => {
    const result = TargetAllocationSchema.safeParse({
      btc: 0.3,
      eth: 0.3,
      spy: 0.2,
      stable: 0.2,
      alt: 0,
      // extra
      junk: 0.5,
    } as unknown);
    expect(result.success).toBe(false);
  });
});
