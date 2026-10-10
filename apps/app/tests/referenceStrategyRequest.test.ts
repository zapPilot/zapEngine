import { buildDefaultBacktestRequest } from '@/integration/referenceStrategyModel';
import { describe, expect, it } from 'vitest';

type BacktestRequestInput = Parameters<typeof buildDefaultBacktestRequest>[0];

function backtestConfigs(value: unknown): BacktestRequestInput {
  return value as BacktestRequestInput;
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
});
