import { describe, expect, it } from 'vitest';
import { sampleTimelineData } from '../../src/services/backtestingTimelineService';
import type { BacktestTimelinePoint } from '../../src/types/backtesting';

function point(index: number): BacktestTimelinePoint {
  return {
    timestamp: `2026-01-0${index + 1}T00:00:00.000Z`,
    strategies: {},
  } as unknown as BacktestTimelinePoint;
}

describe('sampleTimelineData coverage gaps', () => {
  it('uses the midpoint when exactly one non-critical slot remains', () => {
    const timeline = Array.from({ length: 5 }, (_, index) => point(index));

    const sampled = sampleTimelineData(timeline, null, 3);

    expect(sampled).toEqual([timeline[0], timeline[2], timeline[4]]);
  });
});
