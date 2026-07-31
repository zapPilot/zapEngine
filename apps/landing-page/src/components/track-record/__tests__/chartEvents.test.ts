import { describe, expect, it } from 'vitest';
import type { StrategyEvent } from '@/data/track-record-events';
import {
  buildChartMarkers,
  formatCompactUsd,
  formatWholePercent,
} from '../chartEvents';

const POINTS = [
  { date: '2026-01-01', value: 100 },
  { date: '2026-01-02', value: 110 },
  { date: '2026-01-03', value: 120 },
];

function event(overrides: Partial<StrategyEvent> = {}): StrategyEvent {
  return {
    date: '2026-01-02',
    type: 'buy',
    toAsset: 'BTC',
    fromAssets: [],
    reason: '',
    ...overrides,
  };
}

function labelFor(overrides: Partial<StrategyEvent> = {}): string {
  return buildChartMarkers([event(overrides)], POINTS, 100, 200)[0]!.label;
}

describe('marker labels', () => {
  it('states what moved, how much, and how much of the book', () => {
    expect(labelFor({ amountUsd: 10408.84, amountPercent: 19.4 })).toBe(
      'Bought BTC · $10.4k · 19% of portfolio',
    );
  });

  it('drops the amount the live path cannot know, keeping the share', () => {
    expect(labelFor({ amountPercent: 19.4 })).toBe(
      'Bought BTC · 19% of portfolio',
    );
  });

  it('falls back to the bare sentence when neither measure is available', () => {
    expect(labelFor()).toBe('Bought BTC');
  });

  it('keeps the sentence for each kind of move', () => {
    expect(labelFor({ type: 'sell', toAsset: null, fromAssets: ['SPY'] })).toBe(
      'Sold SPY',
    );
    expect(
      labelFor({
        type: 'rotate_to_spy',
        toAsset: 'SPY',
        fromAssets: ['BTC', 'ETH'],
      }),
    ).toBe('Rotated BTC, ETH into SPY');
  });
});

describe('formatCompactUsd', () => {
  it('keeps a trade to one line at every scale', () => {
    expect(formatCompactUsd(820.4)).toBe('$820');
    expect(formatCompactUsd(999.5)).toBe('$1k');
    expect(formatCompactUsd(1000)).toBe('$1k');
    expect(formatCompactUsd(10408.84)).toBe('$10.4k');
    expect(formatCompactUsd(999_999)).toBe('$1M');
    expect(formatCompactUsd(2_180_000)).toBe('$2.2M');
  });

  it('drops a trailing zero tenth rather than printing $10.0k', () => {
    expect(formatCompactUsd(10_000)).toBe('$10k');
    expect(formatCompactUsd(3_000_000)).toBe('$3M');
  });
});

describe('formatWholePercent', () => {
  it('rounds to whole points, since the reader is sizing not auditing', () => {
    expect(formatWholePercent(19.4)).toBe('19%');
    expect(formatWholePercent(19.6)).toBe('20%');
    expect(formatWholePercent(100.3)).toBe('100%');
  });

  it('floors a trade too small to reach a point without calling it zero', () => {
    expect(formatWholePercent(0.02)).toBe('<1%');
    expect(formatWholePercent(0)).toBe('0%');
  });
});

describe('buildChartMarkers', () => {
  it('joins by date and takes y from the series the chart drew', () => {
    const markers = buildChartMarkers(
      [event({ date: '2026-01-03' }), event({ date: '2026-06-01' })],
      POINTS,
      100,
      200,
    );

    expect(markers).toHaveLength(1);
    expect(markers[0]?.index).toBe(2);
    expect(markers[0]?.asset).toBe('BTC');
    expect(markers[0]?.action).toBe('buy');
  });
});
