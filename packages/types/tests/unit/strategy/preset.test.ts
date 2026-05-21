import { describe, expect, it } from 'vitest';

import {
  BacktestDefaultsSchema,
  PortfolioRuleMetadataSchema,
  StrategyConfigsResponseSchema,
  StrategyPresetSchema,
} from '../../../src/strategy/preset.js';

describe('StrategyPresetSchema', () => {
  const valid = {
    config_id: 'cfg-1',
    display_name: 'Balanced',
    description: 'A balanced strategy',
    strategy_id: 'balanced',
    params: { lookback: 30 },
    is_default: true,
    is_benchmark: false,
  };

  it('accepts a fully-populated preset', () => {
    expect(StrategyPresetSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a preset with null description', () => {
    expect(
      StrategyPresetSchema.safeParse({ ...valid, description: null }).success,
    ).toBe(true);
  });

  it('rejects a preset missing is_default', () => {
    const { is_default: _, ...withoutDefault } = valid;
    expect(StrategyPresetSchema.safeParse(withoutDefault).success).toBe(false);
  });

  it('rejects a preset with params as a non-object', () => {
    expect(
      StrategyPresetSchema.safeParse({ ...valid, params: 'not-an-object' })
        .success,
    ).toBe(false);
  });
});

describe('BacktestDefaultsSchema', () => {
  it('accepts integer days and a numeric capital', () => {
    expect(
      BacktestDefaultsSchema.safeParse({ days: 365, total_capital: 10000 })
        .success,
    ).toBe(true);
  });

  it('rejects non-integer days', () => {
    expect(
      BacktestDefaultsSchema.safeParse({ days: 365.5, total_capital: 10000 })
        .success,
    ).toBe(false);
  });
});

describe('PortfolioRuleMetadataSchema', () => {
  it('accepts a complete rule metadata object', () => {
    expect(
      PortfolioRuleMetadataSchema.safeParse({
        name: 'no_oversize',
        priority: 1,
        description: 'Cap single asset exposure',
        default_enabled: true,
      }).success,
    ).toBe(true);
  });

  it('rejects a non-integer priority', () => {
    expect(
      PortfolioRuleMetadataSchema.safeParse({
        name: 'rule',
        priority: 1.5,
        description: '',
        default_enabled: false,
      }).success,
    ).toBe(false);
  });
});

describe('StrategyConfigsResponseSchema', () => {
  it('accepts a response without portfolio_rules (optional)', () => {
    expect(
      StrategyConfigsResponseSchema.safeParse({
        strategies: [],
        presets: [],
        backtest_defaults: { days: 365, total_capital: 10000 },
      }).success,
    ).toBe(true);
  });

  it('accepts a response with portfolio_rules', () => {
    expect(
      StrategyConfigsResponseSchema.safeParse({
        strategies: [],
        presets: [],
        backtest_defaults: { days: 365, total_capital: 10000 },
        portfolio_rules: [
          {
            name: 'rule_a',
            priority: 1,
            description: 'd',
            default_enabled: true,
          },
        ],
      }).success,
    ).toBe(true);
  });
});
