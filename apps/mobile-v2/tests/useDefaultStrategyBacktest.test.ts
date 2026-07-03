import { describe, expect, it } from 'vitest';

import {
  buildDefaultBacktestRequest,
  viewFromResponse,
} from '../src/integration/useDefaultStrategyBacktest';

type BacktestRequestInput = Parameters<typeof buildDefaultBacktestRequest>[0];
type BacktestResponseInput = Parameters<typeof viewFromResponse>[0];

function backtestConfigs(value: unknown): BacktestRequestInput {
  return value as BacktestRequestInput;
}

function backtestResponse(value: unknown): BacktestResponseInput {
  return value as BacktestResponseInput;
}

describe('default strategy backtest mapping', () => {
  it('builds a compare request from the default saved preset', () => {
    const request = buildDefaultBacktestRequest(
      backtestConfigs({
        backtest_defaults: { days: 365, total_capital: 5000 },
        presets: [
          {
            config_id: 'other-preset',
            display_name: 'Other',
            description: null,
            strategy_id: 'dma_fgi_portfolio_rules',
            params: {},
            is_default: false,
            is_benchmark: false,
          },
          {
            config_id: 'saved-default',
            display_name: 'Default',
            description: null,
            strategy_id: 'dma_fgi_portfolio_rules',
            params: { risk: 'balanced' },
            is_default: true,
            is_benchmark: false,
          },
        ],
        strategies: [],
      }),
    );

    expect(request).toEqual({
      days: 365,
      total_capital: 5000,
      configs: [
        {
          config_id: 'dca_classic',
          strategy_id: 'dca_classic',
          params: {},
        },
        {
          config_id: 'saved-default',
          saved_config_id: 'saved-default',
        },
      ],
    });

    expect(
      buildDefaultBacktestRequest(
        backtestConfigs({
          backtest_defaults: { days: 365, total_capital: 5000 },
          presets: [],
          strategies: [],
        }),
        { days: 90 },
      ).days,
    ).toBe(90);
  });

  it('falls back to adhoc portfolio rules defaults without a saved preset', () => {
    const request = buildDefaultBacktestRequest(
      backtestConfigs({
        backtest_defaults: undefined,
        presets: [],
        strategies: [
          {
            strategy_id: 'dma_fgi_portfolio_rules',
            display_name: 'Portfolio rules',
            description: null,
            param_schema: {},
            default_params: { pacing: { k: 0.15 } },
            supports_daily_suggestion: true,
          },
        ],
      }),
    );

    expect(request).toEqual({
      days: 500,
      total_capital: 10000,
      configs: [
        {
          config_id: 'dca_classic',
          strategy_id: 'dca_classic',
          params: {},
        },
        {
          config_id: 'dma_fgi_portfolio_rules_default',
          strategy_id: 'dma_fgi_portfolio_rules',
          params: { pacing: { k: 0.15 } },
        },
      ],
    });
  });

  it('formats the primary non-DCA strategy summary for the desktop card', () => {
    const view = viewFromResponse(
      backtestResponse({
        strategies: {
          dca_classic: {},
          dma_fgi_portfolio_rules_default: {
            display_name: 'Zap Strategy',
            roi_percent: 12.345,
            max_drawdown_percent: -8.9,
            sharpe_ratio: 1.234,
            calmar_ratio: null,
            volatility: 18.75,
            win_rate_percent: null,
            trade_count: 42,
            final_value: 12345.678,
          },
        },
        timeline: [
          {
            strategies: {
              dma_fgi_portfolio_rules_default: {
                portfolio: { total_value: 10000 },
              },
            },
          },
          {
            strategies: {
              dma_fgi_portfolio_rules_default: {
                portfolio: { total_value: 12345.678 },
              },
            },
          },
        ],
      }),
    );

    expect(view).toMatchObject({
      returnLabel: '+12.3%',
      vsBtcLabel: '42 trades',
      vsEthLabel: 'Max DD 8.9%',
      displayName: 'Zap Strategy',
      chartData: [10000, 12345.678],
    });
    expect(view?.metrics).toEqual([
      { label: 'ROI', value: '+12.3%', tone: 'positive' },
      { label: 'Max drawdown', value: '8.9%', tone: 'negative' },
      { label: 'Sharpe', value: '1.23', tone: 'accent' },
      { label: 'Calmar', value: '—', tone: 'accent' },
      { label: 'Volatility', value: '18.8%', tone: 'neutral' },
      { label: 'Win rate', value: '—', tone: 'neutral' },
      { label: 'Trades', value: '42', tone: 'neutral' },
      { label: 'Final value', value: '$12,345.68', tone: 'positive' },
    ]);
  });

  it('keeps unavailable ROI visually neutral instead of negative', () => {
    const view = viewFromResponse(
      backtestResponse({
        strategies: {
          dca_classic: {},
          dma_fgi_portfolio_rules_default: {
            display_name: 'Zap Strategy',
            max_drawdown_percent: null,
            trade_count: 0,
          },
        },
      }),
    );

    expect(view).toMatchObject({
      returnLabel: '—',
      vsBtcLabel: '0 trades',
      vsEthLabel: 'Max DD —',
    });
    expect(view?.metrics[0]).toEqual({
      label: 'ROI',
      value: '—',
      tone: 'neutral',
    });
    expect(view?.metrics.at(-1)).toEqual({
      label: 'Final value',
      value: '—',
      tone: 'neutral',
    });
  });

  it('returns null when the response only contains the DCA baseline', () => {
    expect(
      viewFromResponse(backtestResponse({ strategies: { dca_classic: {} } })),
    ).toBeNull();
  });
});
