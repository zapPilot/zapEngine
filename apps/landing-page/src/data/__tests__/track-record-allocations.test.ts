import { describe, expect, it } from 'vitest';
import equityCurve from '@/data/equity-curve.json';
import {
  demoDailyAllocations,
  parseDailyAllocations,
} from '@/data/track-record-allocations';

const VALID_RAW = {
  assets: ['btc', 'eth', 'spy', 'stable'],
  values: [
    [0.25, 0.25, 0.25, 0.25],
    [0.5, 0, 0, 0.5],
  ],
};

describe('parseDailyAllocations', () => {
  it('converts valid fraction rows to percentage points', () => {
    expect(parseDailyAllocations(VALID_RAW, 2)).toEqual([
      { btc: 25, eth: 25, spy: 25, stable: 25 },
      { btc: 50, eth: 0, spy: 0, stable: 50 },
    ]);
  });

  it('rejects a truncated artifact instead of returning a partial book', () => {
    expect(parseDailyAllocations(VALID_RAW, 3)).toEqual([]);
  });

  it('rejects any row with an out-of-range weight', () => {
    expect(
      parseDailyAllocations(
        {
          ...VALID_RAW,
          values: [[1.01, 0, 0, -0.01]],
        },
        1,
      ),
    ).toEqual([]);
  });

  it('rejects any row whose weights do not sum to a whole book', () => {
    expect(
      parseDailyAllocations(
        {
          ...VALID_RAW,
          values: [[0.25, 0.25, 0.25, 0.2]],
        },
        1,
      ),
    ).toEqual([]);
  });

  it('rejects a malformed row shape', () => {
    expect(
      parseDailyAllocations(
        {
          ...VALID_RAW,
          values: [[0.5, 0.5, 0]],
        },
        1,
      ),
    ).toEqual([]);
  });
});

describe('demoDailyAllocations', () => {
  it('reads one row per strategy series point', () => {
    // The artifact stores rows positionally, so a length mismatch would shift
    // every tooltip's bar onto the wrong day without anything else failing.
    expect(demoDailyAllocations()).toHaveLength(
      equityCurve.series[0]!.values.length,
    );
  });

  it('gives every day a whole book', () => {
    for (const row of demoDailyAllocations()) {
      const total = row.btc + row.eth + row.spy + row.stable;
      expect(total).toBeCloseTo(100, 1);
      for (const weight of Object.values(row)) {
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(100);
      }
    }
  });

  it('opens on the allocation the events metadata reports', () => {
    // Two producers read the same portfolio dict on day zero; this is where a
    // drift between them shows up.
    const [first] = demoDailyAllocations();
    const initial = equityCurve.eventsMeta.initialAllocation;

    expect(first?.btc).toBeCloseTo(initial.btc * 100, 4);
    expect(first?.eth).toBeCloseTo(initial.eth * 100, 4);
    expect(first?.spy).toBeCloseTo(initial.spy * 100, 4);
    expect(first?.stable).toBeCloseTo(initial.stable * 100, 4);
  });

  it('shows the strategy leaving positions entirely, not trimming them', () => {
    // The point of driving the demo snapshots off this: a rotation out of BTC
    // has to actually empty BTC, or the Positions tab keeps contradicting the
    // markers on the chart.
    const rows = demoDailyAllocations();

    expect(rows.some((row) => row.btc === 0)).toBe(true);
    expect(rows.some((row) => row.stable === 0)).toBe(true);
  });
});
