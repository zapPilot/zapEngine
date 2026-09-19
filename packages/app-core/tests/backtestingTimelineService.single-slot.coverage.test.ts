import { describe, expect, it } from 'vitest';

import { sampleTimelineData } from '../src/services/backtestingTimelineService';

const timelinePoint = (date: string) =>
  ({
    date,
    strategies: {
      primary: { execution: { transfers: [] } },
    },
  }) as never;

describe('sampleTimelineData single remaining slot coverage', () => {
  it('uses the midpoint hold day when only one non-critical slot remains', () => {
    const timeline = Array.from({ length: 5 }, (_, index) =>
      timelinePoint(`2026-01-0${index + 1}`),
    );

    expect(
      sampleTimelineData(timeline, 'primary', 3).map((point) => point.date),
    ).toEqual(['2026-01-01', '2026-01-03', '2026-01-05']);
  });
});
