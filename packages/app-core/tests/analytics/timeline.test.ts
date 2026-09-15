import { describe, expect, it } from 'vitest';
import { sampleTimelineData } from '../../src/services/backtestingTimelineService';
import type { BacktestTimelinePoint } from '../../src/types/backtesting';
const timeline = Array.from({ length: 10 }, (_, i) => ({
  date: `2026-01-${String(i + 1).padStart(2, '0')}`,
  strategies: {
    primary: {
      execution: { transfers: i === 2 || i === 7 ? [{ amount_usd: 100 }] : [] },
    },
  },
})) as BacktestTimelinePoint[];
describe('timeline sampling', () => {
  it('retains every transfer date even when critical points exceed the budget', () => {
    expect(sampleTimelineData(timeline, 'primary', 2)).toEqual([
      timeline[0],
      timeline[2],
      timeline[7],
      timeline[9],
    ]);
  });
  it('fills remaining capacity with chronological hold days', () => {
    expect(sampleTimelineData(timeline, 'primary', 5)).toEqual([
      timeline[0],
      timeline[2],
      timeline[5],
      timeline[7],
      timeline[9],
    ]);
    const result = sampleTimelineData(timeline, 'primary', 7);
    expect(result).toHaveLength(7);
    expect(result).toEqual(
      expect.arrayContaining([
        timeline[0],
        timeline[2],
        timeline[7],
        timeline[9],
      ]),
    );
    expect(result.map((p) => p.date)).toEqual(result.map((p) => p.date).sort());
  });
  it('handles missing strategy, no data, and timelines below the cap', () => {
    expect(sampleTimelineData(undefined, null)).toEqual([]);
    expect(sampleTimelineData([], null)).toEqual([]);
    expect(sampleTimelineData(timeline, null)).toBe(timeline);
    expect(sampleTimelineData(timeline, null, 3)).toEqual([
      timeline[0],
      timeline[5],
      timeline[9],
    ]);
    expect(sampleTimelineData(timeline, 'missing', 2)).toEqual([
      timeline[0],
      timeline[9],
    ]);
  });
});
