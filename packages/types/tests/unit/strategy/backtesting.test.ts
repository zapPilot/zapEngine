import { describe, expect, it } from 'vitest';

import {
  BacktestAssumptionsSchema,
  BacktestCompareParamsV3Schema,
  BacktestMacroFearGreedSnapshotSchema,
  BacktestPnlAttributionSchema,
  BacktestRequestSchema,
  BacktestRuleGroupSchema,
  BacktestTradeQuotaParamsV3Schema,
  BacktestSignalSchema,
  BacktestSpotAssetSymbolSchema,
  BacktestStrategyPortfolioSchema,
} from '../../../src/strategy/backtesting.js';

describe('BacktestSpotAssetSymbolSchema', () => {
  it('accepts the three supported spot assets', () => {
    for (const s of ['BTC', 'ETH', 'SPY']) {
      expect(BacktestSpotAssetSymbolSchema.safeParse(s).success).toBe(true);
    }
  });

  it('is case-sensitive (catches accidental lowercase drift)', () => {
    expect(BacktestSpotAssetSymbolSchema.safeParse('btc').success).toBe(false);
  });
});

describe('BacktestRuleGroupSchema', () => {
  it('accepts every documented rule group', () => {
    for (const g of [
      'cross',
      'cooldown',
      'dma_fgi',
      'ath',
      'rotation',
      'none',
    ]) {
      expect(BacktestRuleGroupSchema.safeParse(g).success).toBe(true);
    }
  });

  it('rejects unknown rule groups', () => {
    expect(BacktestRuleGroupSchema.safeParse('experimental').success).toBe(
      false,
    );
  });
});

describe('BacktestRequestSchema', () => {
  it('accepts a minimal request with one config', () => {
    expect(
      BacktestRequestSchema.safeParse({
        total_capital: 10000,
        configs: [{ config_id: 'cfg' }],
      }).success,
    ).toBe(true);
  });

  it('rejects an empty configs array (min 1)', () => {
    expect(
      BacktestRequestSchema.safeParse({
        total_capital: 10000,
        configs: [],
      }).success,
    ).toBe(false);
  });

  it('rejects non-positive total_capital', () => {
    expect(
      BacktestRequestSchema.safeParse({
        total_capital: 0,
        configs: [{ config_id: 'cfg' }],
      }).success,
    ).toBe(false);
  });
});

describe('BacktestSignalSchema', () => {
  it('accepts a signal with confidence in [0,1]', () => {
    expect(
      BacktestSignalSchema.safeParse({
        id: 'sig-1',
        regime: 'bull',
        confidence: 0.85,
      }).success,
    ).toBe(true);
  });

  it('rejects confidence > 1', () => {
    expect(
      BacktestSignalSchema.safeParse({
        id: 'sig-1',
        regime: 'bull',
        confidence: 1.01,
      }).success,
    ).toBe(false);
  });

  it('rejects negative confidence', () => {
    expect(
      BacktestSignalSchema.safeParse({
        id: 'sig-1',
        regime: 'bull',
        confidence: -0.01,
      }).success,
    ).toBe(false);
  });
});

describe('BacktestMacroFearGreedSnapshotSchema', () => {
  it('accepts score within [0,100]', () => {
    expect(
      BacktestMacroFearGreedSnapshotSchema.safeParse({
        score: 75,
        label: 'Greed',
        source: 'cnn',
        updated_at: '2026-05-21',
      }).success,
    ).toBe(true);
  });

  it('rejects score > 100', () => {
    expect(
      BacktestMacroFearGreedSnapshotSchema.safeParse({
        score: 101,
        label: 'Extreme Greed',
        source: 'cnn',
        updated_at: '2026-05-21',
      }).success,
    ).toBe(false);
  });
});

describe('BacktestStrategyPortfolioSchema', () => {
  it('accepts a portfolio with all nonnegative numeric fields', () => {
    expect(
      BacktestStrategyPortfolioSchema.safeParse({
        spot_usd: 1000,
        stable_usd: 500,
        total_value: 1500,
        allocation: { spot: 0.66, stable: 0.34 },
        asset_allocation: {
          btc: 0.3,
          eth: 0.3,
          spy: 0.1,
          stable: 0.3,
          alt: 0,
        },
      }).success,
    ).toBe(true);
  });

  it('rejects negative spot_usd', () => {
    expect(
      BacktestStrategyPortfolioSchema.safeParse({
        spot_usd: -1,
        stable_usd: 0,
        total_value: 0,
        allocation: { spot: 0, stable: 1 },
        asset_allocation: {
          btc: 0,
          eth: 0,
          spy: 0,
          stable: 1,
          alt: 0,
        },
      }).success,
    ).toBe(false);
  });
});

describe('BacktestTradeQuotaParamsV3Schema (strict + partial)', () => {
  it('accepts an empty params object', () => {
    expect(BacktestTradeQuotaParamsV3Schema.safeParse({}).success).toBe(true);
  });

  it('accepts a partial params object and explicit nulls', () => {
    expect(
      BacktestTradeQuotaParamsV3Schema.safeParse({ max_trades_7d: 3 }).success,
    ).toBe(true);
    expect(
      BacktestTradeQuotaParamsV3Schema.safeParse({
        min_trade_interval_days: null,
      }).success,
    ).toBe(true);
  });

  it('rejects limits below one day or one trade', () => {
    expect(
      BacktestTradeQuotaParamsV3Schema.safeParse({ max_trades_30d: 0 }).success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict mode)', () => {
    expect(
      BacktestTradeQuotaParamsV3Schema.safeParse({ junk_param: true }).success,
    ).toBe(false);
  });
});

describe('BacktestCompareParamsV3Schema', () => {
  it('accepts a nested partial config', () => {
    expect(
      BacktestCompareParamsV3Schema.safeParse({
        trade_quota: { max_trades_7d: 2 },
        top_escape: { overextension_threshold_multiplier_greed: 0.4 },
        disabled_rules: ['rule_a'],
        enabled_rules: null,
      }).success,
    ).toBe(true);
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(
      BacktestCompareParamsV3Schema.safeParse({
        trade_quota: {},
        new_unknown_section: {},
      }).success,
    ).toBe(false);
  });

  it.each([
    { signal: { cross_cooldown_days: 5 } },
    { pacing: { k: 5 } },
    { buy_gate: { window_days: 5 } },
    { extreme_fear: { buy_step: 0.1 } },
    { top_escape: { dma_overextension_threshold: 0.3 } },
  ])('rejects parameters that never changed a decision: %j', (removed) => {
    expect(BacktestCompareParamsV3Schema.safeParse(removed).success).toBe(
      false,
    );
  });
});

describe('BacktestAssumptionsSchema (strict)', () => {
  const defaults = { fill_lag_days: 1, slippage_rate: 0.003, stable_apr: 0.03 };

  it('accepts the default assumptions', () => {
    expect(BacktestAssumptionsSchema.safeParse(defaults).success).toBe(true);
  });

  it('accepts them as an optional request field, absent or null', () => {
    const request = {
      total_capital: 10_000,
      configs: [{ config_id: 'a', saved_config_id: 'dma_fgi' }],
    };
    for (const assumptions of [undefined, null, defaults]) {
      expect(
        BacktestRequestSchema.safeParse({ ...request, assumptions }).success,
      ).toBe(true);
    }
  });

  it('rejects a fill lag beyond one bar, negative rates and unknown keys', () => {
    for (const bad of [
      { ...defaults, fill_lag_days: 2 },
      { ...defaults, slippage_rate: -0.001 },
      { ...defaults, stable_apr: 0.6 },
      { ...defaults, spot_apr: 0.05 },
    ]) {
      expect(BacktestAssumptionsSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('BacktestPnlAttributionSchema', () => {
  it('accepts signed parts: price can lose, cost is negative', () => {
    expect(
      BacktestPnlAttributionSchema.safeParse({
        price_usd: -120.5,
        yield_usd: 12.25,
        cost_usd: -3,
      }).success,
    ).toBe(true);
  });

  it('requires all three parts', () => {
    expect(
      BacktestPnlAttributionSchema.safeParse({ price_usd: 1, yield_usd: 2 })
        .success,
    ).toBe(false);
  });
});
