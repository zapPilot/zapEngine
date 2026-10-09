import { describe, expect, it } from 'vitest';
import {
  backtestDisclaimer,
  backtestHeadline,
  backtestSubtitle,
  buildBacktestStats,
  buildComparisonRows,
  referenceTradeSummary,
} from '../backtest-stats';
import strategySnapshot from '../strategy-snapshot.json';
import { formatPercent } from '@/lib/formatPercent';

const DCA = strategySnapshot.strategies.dca_classic;
const STRATEGY =
  strategySnapshot.strategies[
    strategySnapshot.default_strategy_id as keyof typeof strategySnapshot.strategies
  ];

describe('buildBacktestStats', () => {
  const stats = buildBacktestStats();

  it('exposes the five headline metrics', () => {
    expect(stats.map((stat) => stat.label)).toEqual([
      'ROI vs DCA',
      'Strategy ROI',
      'Calmar ratio',
      'Sharpe ratio',
      'Max drawdown',
    ]);
  });

  it('derives every DCA figure from strategy-snapshot.json', () => {
    const roiVsDca = stats[0]!;
    expect(roiVsDca.sublabel).toContain(
      formatPercent(DCA.roi_percent, { scale: 1, signed: 'unicode' }),
    );

    const maxDrawdown = stats[4]!;
    expect(maxDrawdown.sublabel).toContain(
      formatPercent(DCA.max_drawdown_percent, { scale: 1, signed: 'unicode' }),
    );
  });
});

describe('buildComparisonRows', () => {
  const rows = buildComparisonRows();

  it('puts the highlighted strategy row first and DCA second', () => {
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      label: STRATEGY.display_name,
      highlighted: true,
      trades: String(STRATEGY.trade_count),
    });
    expect(rows[1]).toMatchObject({
      label: DCA.display_name,
      highlighted: false,
      roi: formatPercent(DCA.roi_percent, { scale: 1, signed: 'unicode' }),
      trades: String(DCA.trade_count),
    });
  });
});

describe('backtest copy', () => {
  it('describes the window as-of the snapshot reference date', () => {
    expect(backtestSubtitle()).toContain(
      `as of ${strategySnapshot.reference_date}`,
    );
    expect(backtestDisclaimer()).toContain(strategySnapshot.window_end);
    expect(backtestDisclaimer()).not.toContain('pinned');
  });

  it('calls the trades simulated, never executed', () => {
    expect(backtestSubtitle()).toContain(
      `${STRATEGY.trade_count} simulated trades`,
    );
    expect(backtestSubtitle()).not.toMatch(/executed/);
  });

  it('discloses the fill timing, the assumed yield and the S&P 500 sleeve before the caveat', () => {
    const disclaimer = backtestDisclaimer();
    expect(disclaimer).toMatch(/^Hypothetical backtest/);
    expect(disclaimer).toContain('fills each trade the day after its signal');
    expect(disclaimer).toContain('assumes a yield on stablecoin balances only');
    expect(disclaimer).toContain('S&P 500 sleeve');
    expect(disclaimer).toContain(
      'Past performance does not guarantee future results.',
    );
  });

  it('summarizes the reference strategy trades from the fixture', () => {
    expect(referenceTradeSummary()).toBe(
      `${STRATEGY.trade_count} simulated trades over the ${strategySnapshot.window_days}-day backtest`,
    );
    expect(referenceTradeSummary()).not.toMatch(/\d+ trades in \d+ days/);
  });

  it('names both strategies in the headline', () => {
    expect(backtestHeadline()).toBe(
      `${STRATEGY.display_name} vs ${DCA.display_name}`,
    );
  });
});
