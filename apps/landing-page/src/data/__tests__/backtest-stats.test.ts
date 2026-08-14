import { describe, expect, it } from 'vitest';
import {
  backtestDisclaimer,
  backtestSubtitle,
  buildBacktestStats,
  buildComparisonRows,
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
});
