import { formatUsdAmount } from '../../../../src/modules/notifications/message-format.util';
import {
  buildStrategyChangeMessage,
  latestEventDate,
  selectNewEvents,
} from '../../../../src/modules/notifications/strategy-change-message.util';
import type { EquityCurveSubset } from '../../../../src/modules/notifications/track-record/schema';
import {
  createCurveEventFixture,
  createEquityCurveFixture,
} from '../../../test-utils';

/** One event, so the assertion is about the sentence and nothing else. */
function messageForEvent(
  event: Partial<Parameters<typeof createCurveEventFixture>[0]>,
  curveOverrides: Partial<EquityCurveSubset> = {},
): string {
  const built = createCurveEventFixture({ date: '2026-01-03', ...event });
  const curve = createEquityCurveFixture({
    events: [built],
    ...curveOverrides,
  });
  return buildStrategyChangeMessage(curve, [built]);
}

describe('selectNewEvents', () => {
  it('announces only the window end on a first run, never the whole history', () => {
    const curve = createEquityCurveFixture();

    const selected = selectNewEvents(curve, null);

    expect(selected.map((event) => event.date)).toEqual(['2026-01-03']);
  });

  it('announces every event after the stored cursor', () => {
    const curve = createEquityCurveFixture();

    const selected = selectNewEvents(curve, '2026-01-01');

    expect(selected.map((event) => event.date)).toEqual([
      '2026-01-02',
      '2026-01-03',
    ]);
  });

  it('announces nothing when the cursor is already at the newest event', () => {
    expect(selectNewEvents(createEquityCurveFixture(), '2026-01-03')).toEqual(
      [],
    );
  });

  it('returns events in date order regardless of artifact order', () => {
    const curve = createEquityCurveFixture({
      events: [
        createCurveEventFixture({ date: '2026-01-03' }),
        createCurveEventFixture({ date: '2026-01-02' }),
      ],
    });

    expect(selectNewEvents(curve, '2026-01-01').map((e) => e.date)).toEqual([
      '2026-01-02',
      '2026-01-03',
    ]);
  });
});

describe('latestEventDate', () => {
  it('returns the newest event date', () => {
    expect(latestEventDate(createEquityCurveFixture())).toBe('2026-01-03');
  });

  it('scans the whole list rather than trusting artifact order', () => {
    const curve = createEquityCurveFixture({
      events: [
        createCurveEventFixture({ date: '2026-01-03' }),
        createCurveEventFixture({ date: '2026-01-02' }),
      ],
    });

    expect(latestEventDate(curve)).toBe('2026-01-03');
  });

  it('returns null for an artifact that recorded no trades', () => {
    expect(
      latestEventDate(createEquityCurveFixture({ events: [] })),
    ).toBeNull();
  });
});

describe('formatUsdAmount', () => {
  it('rounds to whole dollars with thousands separators', () => {
    expect(formatUsdAmount(921.15)).toBe('$921');
    expect(formatUsdAmount(10030.45)).toBe('$10,030');
  });

  it('keeps a negative sign without includeSign', () => {
    expect(formatUsdAmount(-921.15)).toBe('-$921');
  });

  it('supports fixed precision and an explicit sign', () => {
    const options = { fractionDigits: 2, includeSign: true };

    expect(formatUsdAmount(1234.5, options)).toBe('+$1,234.50');
    expect(formatUsdAmount(-1234.5, options)).toBe('-$1,234.50');
    expect(formatUsdAmount(0, options)).toBe('$0.00');
  });
});

describe('buildStrategyChangeMessage', () => {
  it('refuses to build a message with nothing to announce', () => {
    expect(() =>
      buildStrategyChangeMessage(createEquityCurveFixture(), []),
    ).toThrow('at least one event');
  });

  it('renders the real 2026-08-19 trade exactly', () => {
    const event = createCurveEventFixture({
      date: '2026-08-19',
      type: 'sell',
      toAsset: null,
      fromAssets: ['SPY'],
      amountUsd: 921.15,
      amountPercent: 5,
      reason: 'portfolio_fgi_downshift_dca_sell',
    });
    const curve = createEquityCurveFixture({
      window: { end: '2026-08-19' },
      series: [
        {
          id: 'strategy',
          values: [
            { date: '2026-08-17', value: 183.7 },
            { date: '2026-08-18', value: 183.64 },
            { date: '2026-08-19', value: 184.19 },
          ],
        },
      ],
      allocations: {
        assets: ['btc', 'eth', 'spy', 'stable'],
        values: [
          [0, 0.2595, 0.6907, 0.0497],
          [0, 0.2611, 0.664, 0.0749],
          [0, 0.2634, 0.612, 0.1246],
        ],
      },
      events: [event],
    });

    expect(buildStrategyChangeMessage(curve, [event])).toBe(
      [
        '📈 *Strategy Update — 2026-08-19*',
        '',
        'Sold SPY — $921 (5.0% of portfolio)',
        'Why: Market sentiment fell out of greed, so risk was trimmed with a scheduled sell.',
        '',
        'Before: ETH 26.1% · SPY 66.4% · Cash 7.5%',
        'After: ETH 26.3% · SPY 61.2% · Cash 12.5%',
        '',
        'NAV index: 184.19 (window start = 100)',
        'Strategy: `dma_fgi_portfolio_rules`',
      ].join('\n'),
    );
  });

  describe('action sentence', () => {
    it('names what was sold', () => {
      expect(
        messageForEvent({ type: 'sell', toAsset: null, fromAssets: ['SPY'] }),
      ).toContain('Sold SPY — $5,000 (50.0% of portfolio)');
    });

    it('falls back for a sell with no named source', () => {
      expect(
        messageForEvent({ type: 'sell', toAsset: null, fromAssets: [] }),
      ).toContain('Sold into stables');
    });

    it('names what was bought', () => {
      expect(messageForEvent({ type: 'buy', toAsset: 'BTC' })).toContain(
        'Bought BTC',
      );
    });

    it('falls back for a buy with no named destination', () => {
      expect(messageForEvent({ type: 'buy', toAsset: null })).toContain(
        'Bought into the market',
      );
    });

    it('names both sides of a rotation', () => {
      expect(
        messageForEvent({
          type: 'rotate_to_eth',
          toAsset: 'ETH',
          fromAssets: ['SPY', 'BTC'],
        }),
      ).toContain('Rotated SPY, BTC into ETH');
    });

    it('falls back for a rotation with no named source', () => {
      expect(
        messageForEvent({
          type: 'rotate_to_eth',
          toAsset: 'ETH',
          fromAssets: [],
        }),
      ).toContain('Rotated into ETH');
    });

    it('falls back for a rotation with no named destination', () => {
      expect(
        messageForEvent({
          type: 'rotate_to_eth',
          toAsset: null,
          fromAssets: ['BTC'],
        }),
      ).toContain('Rotated out of BTC');
    });

    it('degrades an unrecognised event type to a neutral sentence', () => {
      expect(
        messageForEvent({ type: 'ladder_in', toAsset: null, fromAssets: [] }),
      ).toContain('Rebalanced');
    });
  });

  describe('reason', () => {
    it('uses the mapped label for every rule the backtest can emit', () => {
      const slugs = [
        'portfolio_cross_down_exit',
        'portfolio_cross_up_equal_weight',
        'portfolio_dma_overextension_dca_sell',
        'portfolio_eth_btc_deviation_dca_to_btc',
        'portfolio_eth_btc_deviation_dca_to_eth',
        'portfolio_eth_btc_deviation_large_to_btc',
        'portfolio_eth_btc_deviation_large_to_eth',
        'portfolio_eth_btc_ratio_rotation_to_btc',
        'portfolio_eth_btc_ratio_rotation_to_eth',
        'portfolio_fgi_downshift_dca_sell',
      ];

      for (const reason of slugs) {
        const why = messageForEvent({ reason })
          .split('\n')
          .find((line) => line.startsWith('Why: '));

        expect(why, reason).toBeDefined();
        // A mapped label is prose; the fallback would echo the slug's words.
        expect(why, reason).not.toContain('portfolio ');
        // Legacy Markdown reads a bare underscore as italics.
        expect(why, reason).not.toContain('_');
      }
    });

    it('spells out an unknown slug rather than dropping the reason', () => {
      expect(messageForEvent({ reason: 'portfolio_brand_new_rule' })).toContain(
        'Why: Portfolio brand new rule.',
      );
    });

    it('says so plainly when the artifact carries no reason', () => {
      expect(messageForEvent({ reason: '' })).toContain(
        'Why: No additional context.',
      );
    });
  });

  describe('allocation', () => {
    it('omits Before when the trade lands on the first day of the window', () => {
      const event = createCurveEventFixture({ date: '2026-01-01' });
      const curve = createEquityCurveFixture({ events: [event] });

      const message = buildStrategyChangeMessage(curve, [event]);

      expect(message).not.toContain('Before:');
      expect(message).toContain('After: Cash 100.0%');
    });

    it('drops a weight too small to render as a real position', () => {
      const event = createCurveEventFixture({ date: '2026-01-03' });
      const curve = createEquityCurveFixture({
        events: [event],
        allocations: {
          assets: ['btc', 'eth', 'spy', 'stable'],
          values: [
            [0, 0, 0, 1],
            [0.5, 0, 0, 0.5],
            [0.9996, 0.0004, 0, 0],
          ],
        },
      });

      expect(buildStrategyChangeMessage(curve, [event])).toContain(
        'After: BTC 100.0%',
      );
    });

    it('drops the position and NAV lines when the series cannot place the trade', () => {
      const event = createCurveEventFixture({ date: '2030-06-01' });
      const curve = createEquityCurveFixture({ events: [event] });

      const message = buildStrategyChangeMessage(curve, [event]);

      expect(message).not.toContain('After:');
      expect(message).not.toContain('NAV index:');
      expect(message).toContain('Strategy: `dma_fgi_portfolio_rules`');
    });
  });

  describe('catch-up message', () => {
    it('dates each trade and spans one before/after across all of them', () => {
      const curve = createEquityCurveFixture();
      const events = selectNewEvents(curve, '2026-01-01');

      const message = buildStrategyChangeMessage(curve, events);

      expect(message).toContain(
        '📈 *Strategy Update — 2 trades through 2026-01-03*',
      );
      expect(message).toContain('2026-01-02 — Bought BTC — $5,000');
      expect(message).toContain('2026-01-03 — Rotated BTC into ETH — $5,000');
      // Before is the day before the first trade; After is the last trade's day.
      expect(message).toContain('Before: Cash 100.0%');
      expect(message).toContain('After: BTC 25.0% · ETH 25.0% · Cash 50.0%');
      expect(message).toContain('NAV index: 120.50 (window start = 100)');
    });

    it('orders the trade blocks by date even when handed them reversed', () => {
      const curve = createEquityCurveFixture();
      const reversed = [...curve.events].reverse();

      const lines = buildStrategyChangeMessage(curve, reversed).split('\n');

      expect(
        lines
          .filter((line) => line.startsWith('2026-'))
          .map((l) => l.slice(0, 10)),
      ).toEqual(['2026-01-02', '2026-01-03']);
    });
  });
});
