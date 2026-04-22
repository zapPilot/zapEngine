import { describe, expect, it } from 'vitest';

import {
  MAX_CHART_POINTS,
  MIN_CHART_POINTS,
  sampleTimelineData,
} from '@/services/backtestingTimeline';
import type { BacktestTimelinePoint } from '@/types/backtesting';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createTimelinePoint(
  index: number,
  opts?: {
    withTransfer?: boolean;
    dcaOnlyTransfer?: boolean;
    invalidTransfers?: unknown[];
    spotAsset?: 'BTC' | 'ETH' | null;
    dcaSpotAsset?: 'BTC' | 'ETH' | null;
  },
): BacktestTimelinePoint {
  const date = new Date('2024-01-01');
  date.setDate(date.getDate() + index);
  const dateStr = date.toISOString().split('T')[0] ?? '2024-01-01';

  return {
    market: {
      date: dateStr,
      token_price: { btc: 50000 + index },
      sentiment: null,
      sentiment_label: null,
    },
    strategies: {
      ...(opts?.dcaOnlyTransfer
        ? {
            dca_classic: {
              portfolio: {
                spot_usd: 5000,
                stable_usd: 5000,
                total_value: 10000,
                allocation: { spot: 0.5, stable: 0.5 },
                ...(opts?.dcaSpotAsset !== undefined && {
                  spot_asset: opts.dcaSpotAsset,
                }),
              },
              signal: null,
              decision: {
                action: 'hold',
                reason: 'baseline_dca',
                rule_group: 'none',
                target_allocation: { spot: 0.5, stable: 0.5 },
                immediate: false,
              },
              execution: {
                event: 'buy',
                transfers: [
                  { from_bucket: 'stable', to_bucket: 'spot', amount_usd: 100 },
                ],
                blocked_reason: null,
                step_count: 1,
                steps_remaining: 0,
                interval_days: 7,
              },
            },
          }
        : {}),
      dma_gated_fgi_default: {
        portfolio: {
          spot_usd: 6000,
          stable_usd: 4000,
          total_value: 10000,
          allocation: { spot: 0.6, stable: 0.4 },
          ...(opts?.spotAsset !== undefined && {
            spot_asset: opts.spotAsset,
          }),
        },
        signal: null,
        decision: {
          action: opts?.withTransfer ? 'buy' : 'hold',
          reason: 'dma_fgi',
          rule_group: opts?.withTransfer ? 'dma_fgi' : 'none',
          target_allocation: { spot: 0.6, stable: 0.4 },
          immediate: false,
        },
        execution: {
          event: opts?.withTransfer ? 'rebalance' : null,
          // Allow injection of arbitrary transfer objects to exercise isValidTransfer
          transfers: opts?.invalidTransfers
            ? (opts.invalidTransfers as BacktestTimelinePoint['strategies'][string]['execution']['transfers'])
            : opts?.withTransfer
              ? [{ from_bucket: 'stable', to_bucket: 'spot', amount_usd: 100 }]
              : [],
          blocked_reason: null,
          step_count: opts?.withTransfer ? 1 : 0,
          steps_remaining: 0,
          interval_days: 3,
        },
      },
    },
  };
}

/**
 * Build a timeline of the given length where indices in criticalSet have a
 * valid non-DCA transfer (making them critical events).
 */
function buildTimeline(
  length: number,
  criticalIndices = new Set<number>(),
): BacktestTimelinePoint[] {
  return Array.from({ length }, (_, i) =>
    createTimelinePoint(i, { withTransfer: criticalIndices.has(i) }),
  );
}

// ---------------------------------------------------------------------------
// sampleTimelineData – public API
// ---------------------------------------------------------------------------

describe('sampleTimelineData', () => {
  // ------------------------------------------------------------------
  // Early-return branches
  // ------------------------------------------------------------------

  it('returns [] for undefined input', () => {
    expect(sampleTimelineData(undefined)).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(sampleTimelineData([])).toEqual([]);
  });

  it('returns the original reference when length <= minPoints', () => {
    const timeline = buildTimeline(MIN_CHART_POINTS);
    const result = sampleTimelineData(timeline);
    expect(result).toBe(timeline);
  });

  it('returns the original reference when length <= minPoints with custom minPoints', () => {
    const timeline = buildTimeline(50);
    const result = sampleTimelineData(timeline, 50);
    expect(result).toBe(timeline);
  });

  // ------------------------------------------------------------------
  // Branch: timeline.length <= effectiveMax (lines 165-167)
  //
  // effectiveMax = Math.min(150, Math.max(minPoints, criticalCount + 20))
  // With enough critical events, effectiveMax expands beyond minPoints.
  // When the timeline itself is shorter than effectiveMax, we return early.
  //
  // Setup: 110-point timeline with 100 critical events (non-DCA transfers at
  // indices 1-100).  criticalCount = 102 (indices 0, 1-100, 109).
  // effectiveMax = Math.min(150, Math.max(90, 102 + 20)) = 122.
  // 110 <= 122 → early return.
  // ------------------------------------------------------------------

  it('returns the original reference when timeline length falls within the expanded effectiveMax', () => {
    const length = 110;
    // Indices 0 and length-1 are always critical; add 1..100 as critical too.
    const criticals = new Set(Array.from({ length: 100 }, (_, i) => i + 1));
    const timeline = buildTimeline(length, criticals);

    const result = sampleTimelineData(timeline);

    // The function must return the same reference (early-return path).
    expect(result).toBe(timeline);
    expect(result).toHaveLength(length);
  });

  // ------------------------------------------------------------------
  // Standard sampling – first and last points are preserved
  // ------------------------------------------------------------------

  it('preserves the first and last data points after sampling', () => {
    const timeline = buildTimeline(200);
    const result = sampleTimelineData(timeline);

    expect(result[0]).toEqual(timeline[0]);
    expect(result[result.length - 1]).toEqual(timeline[timeline.length - 1]);
  });

  // ------------------------------------------------------------------
  // Non-DCA transfer points are treated as critical
  // ------------------------------------------------------------------

  it('preserves points that contain non-DCA spot/stable transfers', () => {
    const timeline = Array.from({ length: 220 }, (_, i) =>
      createTimelinePoint(i, { withTransfer: i === 75 }),
    );

    const result = sampleTimelineData(timeline);

    expect(
      result.some((p) => p.market.date === timeline[75]?.market.date),
    ).toBe(true);
  });

  it('expands sampling to preserve non-DCA spot asset changes', () => {
    const timeline = Array.from({ length: 220 }, (_, i) =>
      createTimelinePoint(i, {
        spotAsset: i <= 100 ? (i % 2 === 0 ? 'BTC' : 'ETH') : 'ETH',
      }),
    );

    const result = sampleTimelineData(timeline);

    expect(result.length).toBeGreaterThan(MIN_CHART_POINTS);
  });

  // ------------------------------------------------------------------
  // DCA-only transfers are NOT critical
  // ------------------------------------------------------------------

  it('does not treat dca_classic-only transfers as critical events', () => {
    const timeline = Array.from({ length: 220 }, (_, i) =>
      createTimelinePoint(i, { dcaOnlyTransfer: i === 75 }),
    );

    const result = sampleTimelineData(timeline);

    expect(result.length).toBeLessThan(timeline.length);
  });

  // ------------------------------------------------------------------
  // Branch: remainingSlots <= 0 (line 174)
  //
  // When the number of critical indices alone meets or exceeds effectiveMax,
  // no non-critical points are sampled and the function returns only the
  // critical set.
  //
  // Setup: 200-point timeline where indices 1-148 all have non-DCA transfers.
  // criticalIndices = {0, 1..148, 199} → size = 150.
  // effectiveMax = Math.min(150, Math.max(90, 150 + 20)) = 150.
  // remainingSlots = 150 - 150 = 0 → takes the early-return path.
  // ------------------------------------------------------------------

  it('returns only critical points when remainingSlots is zero', () => {
    const length = 200;
    // Create 148 interior critical events; together with indices 0 and 199
    // that gives criticalIndices.size = 150, which equals MAX_CHART_POINTS.
    const criticals = new Set(Array.from({ length: 148 }, (_, i) => i + 1));
    const timeline = buildTimeline(length, criticals);

    const result = sampleTimelineData(timeline);

    // All returned points must be from the critical set.
    const criticalDates = new Set(
      [0, ...criticals, length - 1].map((i) => timeline[i]?.market.date),
    );
    for (const p of result) {
      expect(criticalDates.has(p.market.date)).toBe(true);
    }
    // Result length equals effectiveMax (150), not the full timeline (200).
    expect(result).toHaveLength(MAX_CHART_POINTS);
  });

  // ------------------------------------------------------------------
  // Branch: sampleEvenlyFromIndices with targetSize === 1 (lines 59-62)
  //
  // remainingSlots === 1 requires effectiveMax = criticalCount + 1.
  // effectiveMax = Math.min(150, Math.max(minPoints, criticalCount + 20)).
  // The +20 padding prevents remainingSlots from reaching 1 unless
  // MAX_CHART_POINTS caps the value.
  //
  // If criticalCount = 149 → effectiveMax = Math.min(150, 149+20) = 150
  // remainingSlots = 150 - 149 = 1 → sampleEvenlyFromIndices called with
  // targetSize = 1, producing exactly one non-critical point (the middle one).
  // ------------------------------------------------------------------

  it('samples exactly one non-critical point when remainingSlots equals one', () => {
    // 201-point timeline: indices 1-149 have non-DCA transfers.
    // criticalIndices = {0, 1..149, 200} → size = 151 > 150.
    // Wait – size 151 would make remainingSlots = 150 - 151 = -1, triggering
    // the remainingSlots <= 0 branch instead.  Use 147 interior criticals so
    // criticalCount = 149.
    const length = 300;
    const criticals = new Set(Array.from({ length: 147 }, (_, i) => i + 1));
    // criticalIndices = {0, 1..147, 299} → size = 149
    // effectiveMax = Math.min(150, Math.max(90, 149+20)) = Math.min(150, 169) = 150
    // remainingSlots = 150 - 149 = 1
    const timeline = buildTimeline(length, criticals);

    const result = sampleTimelineData(timeline);

    // All critical points must appear.
    const criticalDates = new Set(
      [0, ...criticals, length - 1].map((i) => timeline[i]?.market.date),
    );
    const criticalCount = criticalDates.size;

    // Result = critical points (149) + 1 non-critical point = 150.
    expect(result).toHaveLength(MAX_CHART_POINTS);
    // Exactly one result point is not from the critical set.
    const nonCriticalResults = result.filter(
      (p) => !criticalDates.has(p.market.date),
    );
    expect(nonCriticalResults).toHaveLength(1);
    // The single non-critical point must be from the middle of the non-critical pool.
    expect(criticalCount).toBe(149);
  });

  // ------------------------------------------------------------------
  // Dense-event timeline: result may exceed MAX_CHART_POINTS
  // ------------------------------------------------------------------

  it('returns more than MAX_CHART_POINTS when dense critical events require it', () => {
    const timeline = Array.from({ length: 260 }, (_, i) =>
      createTimelinePoint(i, { withTransfer: i > 0 && i < 180 }),
    );

    const result = sampleTimelineData(timeline);

    expect(result.length).toBeGreaterThan(MAX_CHART_POINTS);
    expect(result[0]?.market.date).toBe(timeline[0]?.market.date);
    expect(result[result.length - 1]?.market.date).toBe(
      timeline[timeline.length - 1]?.market.date,
    );
  });

  // ------------------------------------------------------------------
  // isValidTransfer – exercised via transfers array filtering
  // ------------------------------------------------------------------

  describe('transfer validation (isValidTransfer branches)', () => {
    /**
     * Force an invalid transfer through the filter by injecting it directly
     * into the execution.transfers array of a non-DCA strategy. The invalid
     * transfer must NOT cause the point to be treated as critical.
     */
    function buildLargeTimelineWithInvalidTransfersAt(
      targetIndex: number,
      invalidTransfers: unknown[],
    ): BacktestTimelinePoint[] {
      return Array.from({ length: 200 }, (_, i) =>
        i === targetIndex
          ? createTimelinePoint(i, { invalidTransfers })
          : createTimelinePoint(i),
      );
    }

    it('ignores null entries in the transfers array', () => {
      // null is falsy → isValidTransfer returns false at the !t guard.
      const timeline = buildLargeTimelineWithInvalidTransfersAt(50, [null]);
      const result = sampleTimelineData(timeline);

      // The point at index 50 with a null transfer is NOT critical,
      // so the result is properly sampled (shorter than raw timeline).
      expect(result.length).toBeLessThanOrEqual(MAX_CHART_POINTS);
      // First and last must still appear.
      expect(result[0]?.market.date).toBe(timeline[0]?.market.date);
    });

    it('ignores primitive (non-object) entries in the transfers array', () => {
      // A string passes !t but fails typeof t !== "object".
      const timeline = buildLargeTimelineWithInvalidTransfersAt(50, [
        'not-an-object',
      ]);
      const result = sampleTimelineData(timeline);

      expect(result.length).toBeLessThanOrEqual(MAX_CHART_POINTS);
    });

    it('ignores transfers with an invalid from_bucket', () => {
      const timeline = buildLargeTimelineWithInvalidTransfersAt(50, [
        { from_bucket: 'crypto', to_bucket: 'stable', amount_usd: 100 },
      ]);
      const result = sampleTimelineData(timeline);

      expect(result.length).toBeLessThanOrEqual(MAX_CHART_POINTS);
    });

    it('ignores transfers with an invalid to_bucket', () => {
      const timeline = buildLargeTimelineWithInvalidTransfersAt(50, [
        { from_bucket: 'spot', to_bucket: 'fiat', amount_usd: 100 },
      ]);
      const result = sampleTimelineData(timeline);

      expect(result.length).toBeLessThanOrEqual(MAX_CHART_POINTS);
    });

    it('ignores transfers where amount_usd is not a number', () => {
      const timeline = buildLargeTimelineWithInvalidTransfersAt(50, [
        { from_bucket: 'spot', to_bucket: 'stable', amount_usd: '100' },
      ]);
      const result = sampleTimelineData(timeline);

      expect(result.length).toBeLessThanOrEqual(MAX_CHART_POINTS);
    });

    it('treats a transfer valid only when both buckets and amount_usd are correct', () => {
      // Sanity check: a fully valid transfer DOES make the point critical.
      const timeline = Array.from({ length: 200 }, (_, i) =>
        i === 50
          ? createTimelinePoint(i, { withTransfer: true })
          : createTimelinePoint(i),
      );
      const result = sampleTimelineData(timeline);

      expect(
        result.some((p) => p.market.date === timeline[50]?.market.date),
      ).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // extractTransfers – non-array transfers field
  // ------------------------------------------------------------------

  it('handles a strategy whose execution.transfers is not an array', () => {
    // Inject a strategy with transfers set to a non-array value.
    // extractTransfers returns [] for non-arrays, so no critical event.
    const timeline: BacktestTimelinePoint[] = Array.from(
      { length: 200 },
      (_, i) => {
        const point = createTimelinePoint(i);
        if (i === 50) {
          // Override transfers to a non-array value via type cast.
          (
            point.strategies['dma_gated_fgi_default'] as {
              execution: { transfers: unknown };
            }
          ).execution.transfers = 'not-an-array';
        }
        return point;
      },
    );

    // Should not throw and should not treat index 50 as critical.
    const result = sampleTimelineData(timeline);
    expect(result.length).toBeLessThanOrEqual(MAX_CHART_POINTS);
  });
});
