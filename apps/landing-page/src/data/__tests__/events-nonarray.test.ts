import { describe, expect, it, vi } from 'vitest';

vi.mock('@/data/equity-curve.json', () => ({
  default: {
    events: [
      {
        date: '2026-01-01',
        type: 'buy',
        fromAssets: 'BTC',
        toAsset: 'ETH',
        reason: 'x',
      },
      { date: '2026-01-02', type: 'sell', reason: 'y' },
    ],
  },
}));

describe('demo events non-array guard', () => {
  it('drops non-array fromAssets', async () => {
    const mod = await import('@/data/track-record-events');
    const events = mod.demoStrategyEvents();
    expect(events[0]?.fromAssets).toEqual([]);
    expect(events[1]?.fromAssets).toEqual([]);
  });
});
